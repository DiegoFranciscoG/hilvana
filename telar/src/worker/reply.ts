/**
 * Respuestas salientes. El modelo y la red quedan fuera de las transacciones; la base garantiza:
 *  - una sola respuesta automática por mensaje entrante (índice único en in_reply_to, T-02);
 *  - nada de texto libre fuera de la ventana del canal (T-07): el mensaje queda "blocked" y se deriva.
 * Ante la duda se prefiere no enviar dos veces: un envío que falla se marca y pasa a una persona.
 */
import type { ChannelType } from '../../../sdk/ts/envelope.ts';
import { decideSend } from '../../connectors/window.ts';
import type { GuardrailConfig } from '../../../agent/src/guardrails.ts';
import type { ModelProvider } from '../../../agent/src/providers/types.ts';
import { CatalogResponder } from '../../../agent/src/providers/local.ts';
import { OpenAICompatibleProvider } from '../../../agent/src/providers/openai_compatible.ts';
import { respond } from '../../../agent/src/runtime.ts';
import { validateSpec } from '../../../agent/src/spec.ts';
import type { TelarConfig } from '../config.ts';
import { type Sql, type Tx, withWorkspace } from '../db.ts';
import type { Logger } from '../log.ts';
import { PgRetriever } from '../pg/knowledge.ts';
import type { HumanReplyResult } from '../ports.ts';
import type { ReplyTask } from './process.ts';
import type { Sender } from './send.ts';

export interface Notifier {
  notifyHandoff(workspaceId: string, tokens: { token: string; platform: string }[], text: string): Promise<void>;
}

export interface ReplyDeps {
  sql: Sql;
  config: Pick<TelarConfig, 'policies'>;
  guardrails: GuardrailConfig;
  sender: Sender;
  logger: Logger;
  notifier?: Notifier;
  providerFactory?: (publicConfig: Record<string, unknown> | null, apiKey: string | null) => ModelProvider;
  now?: () => Date;
}

interface ConversationContext {
  status: string;
  channelType: ChannelType;
  externalChannelId: string;
  credentialId: string;
  humanAgentApproved: boolean;
  recipientId: string;
  lastInboundAt: Date | null;
}

export function defaultProviderFactory(publicConfig: Record<string, unknown> | null, apiKey: string | null): ModelProvider {
  const baseUrl = typeof publicConfig?.baseUrl === 'string' ? publicConfig.baseUrl : null;
  const model = typeof publicConfig?.model === 'string' ? publicConfig.model : null;
  if (!baseUrl || !model) return new CatalogResponder();
  return new OpenAICompatibleProvider({ baseUrl, model, apiKey: apiKey ?? undefined });
}

async function conversationContext(tx: Tx, conversationId: string): Promise<ConversationContext | null> {
  const [row] = await tx<{
    status: string;
    type: ChannelType;
    external_id: string;
    credential_id: string;
    human_agent: boolean | null;
    recipient: string;
    last_inbound_at: Date | null;
  }[]>`
    select c.status, ch.type, ch.external_id, ch.credential_id,
           (cr.public_config ->> 'humanAgentApproved')::boolean as human_agent,
           ct.external_id as recipient, ct.last_inbound_at
    from public.conversation c
    join public.channel ch on ch.id = c.channel_id
    join public.credential cr on cr.id = ch.credential_id
    join public.contact ct on ct.id = c.contact_id
    where c.id = ${conversationId}`;
  if (!row) return null;
  return {
    status: row.status,
    channelType: row.type,
    externalChannelId: row.external_id,
    credentialId: row.credential_id,
    humanAgentApproved: row.human_agent === true,
    recipientId: row.recipient,
    lastInboundAt: row.last_inbound_at,
  };
}

async function accessToken(tx: Tx, credentialId: string): Promise<string> {
  const [row] = await tx<{ secret: Record<string, string> }[]>`
    select private.telar_credential_secret(${credentialId}::uuid) as secret`;
  return row.secret.accessToken;
}

export class Replier {
  constructor(private readonly deps: ReplyDeps) {}

  #now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async agentReply(workspaceId: string, task: ReplyTask): Promise<'sent' | 'blocked' | 'handoff' | 'skipped' | 'failed'> {
    const { sql, logger } = this.deps;
    const prepared = await withWorkspace(sql, workspaceId, async (tx) => {
      const context = await conversationContext(tx, task.conversationId);
      if (!context || context.status !== 'agent') return null;
      const [spec] = await tx<{ spec: unknown }[]>`
        select s.spec from public.workspace w join public.agent_spec s on s.id = w.active_agent_spec_id`;
      if (!spec) return null; // sin agente publicado, la conversación la atiende el equipo
      const [inbound] = await tx<{ body: string | null }[]>`select body from public.message where id = ${task.inboundMessageId}`;
      const history = await tx<{ direction: string; body: string | null }[]>`
        select direction, body from public.message
        where conversation_id = ${task.conversationId} and id <> ${task.inboundMessageId} and body is not null
        order by created_at desc limit 8`;
      const [counts] = await tx<{ agent_turns: number; replied: boolean }[]>`
        select count(*) filter (where author = 'agent')::int as agent_turns,
               bool_or(author in ('agent', 'human')) as replied
        from public.message where conversation_id = ${task.conversationId}`;
      const [budget] = await tx<{ tokens_left: string }[]>`select tokens_left from private.telar_ai_budget()`;
      const [ai] = await tx<{ credential_id: string; public_config: Record<string, unknown> }[]>`
        select credential_id, public_config from private.telar_ai_credential()`;
      const aiKey = ai
        ? (await tx<{ secret: Record<string, string> }[]>`select private.telar_credential_secret(${ai.credential_id}::uuid) as secret`)[0]
          .secret.apiKey
        : null;
      return {
        context,
        spec: spec.spec,
        inbound: inbound?.body ?? '',
        history: history.reverse().map((h) => ({ role: h.direction === 'inbound' ? 'user' as const : 'assistant' as const, content: h.body! })),
        agentTurns: counts.agent_turns,
        firstReply: !counts.replied,
        tokensLeft: Number(budget?.tokens_left ?? 0),
        provider: (this.deps.providerFactory ?? defaultProviderFactory)(ai?.public_config ?? null, aiKey),
      };
    });
    if (!prepared) return 'skipped';
    const validation = validateSpec(prepared.spec);
    if (!validation.ok) {
      logger.warn('agent_spec_invalid', { workspaceId, issues: validation.issues });
      return 'skipped';
    }

    const now = this.#now();
    const decision = await respond({
      spec: validation.spec,
      inbound: prepared.inbound,
      history: prepared.history,
      agentTurns: prepared.agentTurns,
      isFirstReply: prepared.firstReply,
      now,
      retriever: new PgRetriever(sql, workspaceId),
      provider: prepared.provider,
      guardrails: this.deps.guardrails,
      tokensLeft: prepared.tokensLeft,
    });
    const window = decideSend(this.deps.config.policies, {
      channel: prepared.context.channelType,
      author: 'agent',
      contentKind: 'text',
      lastInboundAt: prepared.context.lastInboundAt,
      now,
      humanAgentApproved: false,
    });

    const recorded = await withWorkspace(sql, workspaceId, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into public.message (workspace_id, conversation_id, channel_id, direction, author, in_reply_to, kind, body, status, payload)
        select ${workspaceId}, c.id, c.channel_id, 'outbound', 'agent', ${task.inboundMessageId}, 'text', ${decision.text},
               ${window.allowed ? 'queued' : 'blocked'}, ${tx.json({ flags: decision.flags })}
        from public.conversation c where c.id = ${task.conversationId}
        on conflict (in_reply_to) where author = 'agent' do nothing
        returning id`;
      if (rows.length === 0) return null; // otro trabajador ya respondió a este mensaje (T-02)
      await tx`
        insert into public.usage_daily (workspace_id, day, ai_input_tokens, ai_output_tokens)
        values (${workspaceId}, current_date, ${decision.usage.inputTokens}, ${decision.usage.outputTokens})
        on conflict (workspace_id, day) do update set
          ai_input_tokens = usage_daily.ai_input_tokens + excluded.ai_input_tokens,
          ai_output_tokens = usage_daily.ai_output_tokens + excluded.ai_output_tokens`;
      const handoffReason = !window.allowed ? 'window_closed' : decision.action === 'handoff' ? decision.reason : null;
      if (handoffReason) {
        await tx`update public.conversation set status = 'human' where id = ${task.conversationId}`;
        await tx`insert into public.handoff (workspace_id, conversation_id, reason, detail)
          values (${workspaceId}, ${task.conversationId}, ${handoffReason}, ${decision.flags.join(',').slice(0, 500) || null})`;
      }
      if (decision.action === 'reply' && decision.leadInterest) {
        await tx`insert into public.lead (workspace_id, conversation_id, contact_id, interest)
          select ${workspaceId}, c.id, c.contact_id, ${decision.leadInterest.slice(0, 500)}
          from public.conversation c where c.id = ${task.conversationId}`;
      }
      const tokens = handoffReason
        ? await tx<{ token: string; platform: string }[]>`select token, platform from private.telar_member_device_tokens()`
        : [];
      const secret = window.allowed ? await accessToken(tx, prepared.context.credentialId) : null;
      return { id: rows[0].id, handoff: Boolean(handoffReason), tokens, secret };
    });
    if (!recorded) return 'skipped';
    if (recorded.handoff && this.deps.notifier && recorded.tokens.length) {
      await this.deps.notifier.notifyHandoff(workspaceId, recorded.tokens, 'Una conversación necesita a una persona del equipo.')
        .catch((error) => logger.warn('push_failed', { workspaceId, error }));
    }
    if (!window.allowed || !recorded.secret) return 'blocked';

    const status = await this.#deliver(workspaceId, recorded.id, prepared.context, recorded.secret, decision.text, false);
    if (status === 'failed') return 'failed';
    return recorded.handoff ? 'handoff' : 'sent';
  }

  async humanReply(input: { workspaceId: string; conversationId: string; userId: string; text: string }): Promise<HumanReplyResult> {
    const { sql } = this.deps;
    const now = this.#now();
    const prepared = await withWorkspace(sql, input.workspaceId, async (tx) => {
      const context = await conversationContext(tx, input.conversationId);
      if (!context) return null;
      const decision = decideSend(this.deps.config.policies, {
        channel: context.channelType,
        author: 'human',
        contentKind: 'text',
        lastInboundAt: context.lastInboundAt,
        now,
        humanAgentApproved: context.humanAgentApproved,
      });
      const [message] = await tx<{ id: string }[]>`
        insert into public.message (workspace_id, conversation_id, channel_id, direction, author, sent_by, kind, body, status)
        select ${input.workspaceId}, c.id, c.channel_id, 'outbound', 'human', ${input.userId}, 'text', ${input.text},
               ${decision.allowed ? 'queued' : 'blocked'}
        from public.conversation c where c.id = ${input.conversationId}
        returning id`;
      await tx`update public.conversation set status = 'human', assigned_to = coalesce(assigned_to, ${input.userId}),
        last_message_at = now(), unread_count = 0 where id = ${input.conversationId} and status <> 'closed'`;
      const secret = decision.allowed ? await accessToken(tx, context.credentialId) : null;
      return { context, decision, messageId: message.id, secret };
    });
    if (!prepared) return { status: 'failed', reason: 'not_found' };
    if (!prepared.decision.allowed || !prepared.secret) {
      return { status: 'blocked', reason: prepared.decision.reason, messageId: prepared.messageId };
    }
    const status = await this.#deliver(
      input.workspaceId,
      prepared.messageId,
      prepared.context,
      prepared.secret,
      input.text,
      prepared.decision.mode === 'human_agent_tag',
    );
    return { status, messageId: prepared.messageId };
  }

  async #deliver(
    workspaceId: string,
    messageId: string,
    context: ConversationContext,
    token: string,
    text: string,
    humanAgentTag: boolean,
  ): Promise<'sent' | 'failed'> {
    try {
      const result = await this.deps.sender(
        { channel: context.channelType, externalChannelId: context.externalChannelId, recipientId: context.recipientId, accessToken: token },
        { kind: 'text', text },
        { humanAgentTag },
      );
      await withWorkspace(this.deps.sql, workspaceId, async (tx) => {
        await tx`update public.message set status = 'sent', channel_message_id = ${result.externalMessageId} where id = ${messageId}`;
        await tx`
          insert into public.usage_daily (workspace_id, day, messages_out) values (${workspaceId}, current_date, 1)
          on conflict (workspace_id, day) do update set messages_out = usage_daily.messages_out + 1`;
      });
      return 'sent';
    } catch (error) {
      this.deps.logger.warn('send_failed', { workspaceId, channel: context.channelType, error });
      await withWorkspace(this.deps.sql, workspaceId, async (tx) => {
        await tx`update public.message set status = 'failed',
          error = ${tx.json({ message: String((error as Error).message ?? error).slice(0, 300) })} where id = ${messageId}`;
      });
      return 'failed';
    }
  }
}

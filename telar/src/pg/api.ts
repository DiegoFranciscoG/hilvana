/** Implementación del puerto de la API de la bandeja sobre Postgres, Auth y los conectores. */
import { ShopifyAdmin } from '../../connectors/shopify/admin.ts';
import type { GuardrailConfig } from '../../../agent/src/guardrails.ts';
import { respond } from '../../../agent/src/runtime.ts';
import { validateSpec } from '../../../agent/src/spec.ts';
import type { TelarConfig } from '../config.ts';
import { assertUuid, type Sql, withWorkspace } from '../db.ts';
import type { ApiPort, HumanReplyResult } from '../ports.ts';
import { defaultProviderFactory, type Replier } from '../worker/reply.ts';
import { PgRetriever, upsertChunk } from './knowledge.ts';

export class PgApi implements ApiPort {
  constructor(
    private readonly sql: Sql,
    private readonly deps: {
      config: Pick<TelarConfig, 'supabaseUrl' | 'supabaseSecretKey' | 'shopify'>;
      replier: Replier;
      guardrails: GuardrailConfig;
      fetch?: typeof fetch;
    },
  ) {}

  memberRole(workspaceId: string, userId: string): Promise<'owner' | 'agent' | 'viewer' | null> {
    return withWorkspace(this.sql, workspaceId, async (tx) => {
      const [row] = await tx<{ role: 'owner' | 'agent' | 'viewer' }[]>`
        select role from public.member where user_id = ${assertUuid(userId)}`;
      return row?.role ?? null;
    });
  }

  async conversationWorkspace(conversationId: string): Promise<string | null> {
    const [row] = await this.sql<{ id: string | null }[]>`
      select private.telar_conversation_workspace(${assertUuid(conversationId)}::uuid) as id`;
    return row?.id ?? null;
  }

  sendHumanReply(input: { workspaceId: string; conversationId: string; userId: string; text: string }): Promise<HumanReplyResult> {
    return this.deps.replier.humanReply(input);
  }

  /**
   * T-11: borra los datos de la app y luego el usuario en Auth (lo que elimina sus sesiones y
   * refresh tokens: la sesión se cierra en todos sus dispositivos).
   */
  async deleteAccount(userId: string): Promise<Record<string, unknown>> {
    const id = assertUuid(userId);
    const key = this.deps.config.supabaseSecretKey;
    if (!key) throw new Error('SUPABASE_SECRET_KEY is required for account deletion');
    const [row] = await this.sql<{ summary: Record<string, unknown> }[]>`select private.delete_account_data(${id}::uuid) as summary`;
    const response = await (this.deps.fetch ?? fetch)(`${this.deps.config.supabaseUrl}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    if (!response.ok && response.status !== 404) throw new Error(`auth admin delete failed with ${response.status}`);
    return row.summary;
  }

  async previewAgent(input: { workspaceId: string; spec?: unknown; message: string }): Promise<{ action: string; text: string; flags: string[] }> {
    const stored = await withWorkspace(this.sql, input.workspaceId, async (tx) => {
      const [row] = await tx<{ spec: unknown }[]>`
        select s.spec from public.workspace w join public.agent_spec s on s.id = w.active_agent_spec_id`;
      const [ai] = await tx<{ credential_id: string; public_config: Record<string, unknown> }[]>`
        select credential_id, public_config from private.telar_ai_credential()`;
      const key = ai
        ? (await tx<{ secret: Record<string, string> }[]>`select private.telar_credential_secret(${ai.credential_id}::uuid) as secret`)[0].secret.apiKey
        : null;
      return { spec: row?.spec, ai: ai?.public_config ?? null, key };
    });
    const validation = validateSpec(input.spec ?? stored.spec);
    if (!validation.ok) return { action: 'invalid_spec', text: validation.issues.join('\n'), flags: [] };
    const decision = await respond({
      spec: validation.spec,
      inbound: input.message,
      history: [],
      agentTurns: 0,
      isFirstReply: true,
      now: new Date(),
      retriever: new PgRetriever(this.sql, input.workspaceId),
      provider: defaultProviderFactory(stored.ai, stored.key),
      guardrails: this.deps.guardrails,
    });
    return { action: decision.action, text: decision.text, flags: decision.flags };
  }

  async syncShopifyCatalog(workspaceId: string): Promise<{ upserted: number }> {
    const source = await withWorkspace(this.sql, workspaceId, async (tx) => {
      const [channel] = await tx<{ external_id: string; credential_id: string }[]>`
        select external_id, credential_id from public.channel where type = 'shopify' and status = 'active' limit 1`;
      if (!channel) return null;
      const [row] = await tx<{ secret: Record<string, string> }[]>`
        select private.telar_credential_secret(${channel.credential_id}::uuid) as secret`;
      return { shop: channel.external_id, token: row.secret.accessToken };
    });
    if (!source) return { upserted: 0 };
    const admin = new ShopifyAdmin({
      shopDomain: source.shop,
      apiVersion: this.deps.config.shopify.apiVersion,
      accessToken: source.token,
      fetch: this.deps.fetch,
    });
    const catalog = await admin.fetchCatalog();
    await withWorkspace(this.sql, workspaceId, async (tx) => {
      for (const item of catalog) {
        await upsertChunk(tx, workspaceId, {
          source: 'catalog',
          externalRef: item.externalRef,
          title: item.title,
          content: item.description,
          price: item.price,
          currency: item.currency,
          stock: item.stock,
        });
      }
    });
    return { upserted: catalog.length };
  }
}

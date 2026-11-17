/**
 * Ciclo del agente para un mensaje entrante. El modelo propone; los controles deciden qué sale.
 */
import { z } from 'zod';
import {
  asksForHuman,
  checkOutput,
  detectComplaint,
  detectInjection,
  type GuardrailConfig,
  type ModelOutput,
} from './guardrails.ts';
import type { KnowledgeItem, Retriever } from './knowledge.ts';
import { buildRules, buildSystemPrompt, describeHours, wrapCustomerMessage } from './prompt.ts';
import type { ChatMessage, ModelProvider } from './providers/types.ts';
import { type AgentSpec, isOpen } from './spec.ts';

export type HandoffReason =
  | 'requested_by_contact'
  | 'complaint'
  | 'low_confidence'
  | 'guardrail'
  | 'out_of_scope'
  | 'limit_reached'
  | 'error';

export interface AgentInput {
  spec: AgentSpec;
  inbound: string;
  history: ChatMessage[];
  agentTurns: number;
  isFirstReply: boolean;
  now: Date;
  retriever: Retriever;
  provider: ModelProvider;
  guardrails: GuardrailConfig;
  /** Tokens de IA que le quedan hoy al espacio (límite por espacio, #55 LLM10). */
  tokensLeft?: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type AgentDecision =
  | {
    action: 'reply';
    text: string;
    intent: ModelOutput['intent'];
    mentionedProducts: string[];
    leadInterest?: string;
    usage: Usage;
    flags: string[];
  }
  | { action: 'handoff'; reason: HandoffReason; text: string; usage: Usage; flags: string[] };

const OutputSchema = z.object({
  reply: z.string(),
  intent: z.enum(['answer', 'handoff', 'lead', 'out_of_scope']),
  mentionedProducts: z.array(z.string()).max(20),
  leadInterest: z.string().max(300).nullish(),
});

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };

function fill(template: string, spec: AgentSpec): string {
  return template.replace('{business}', spec.business.name).replace('{hours}', describeHours(spec));
}

function handoffText(spec: AgentSpec, now: Date, guardrails: GuardrailConfig): string {
  return isOpen(spec, now)
    ? spec.handoff.message
    : `${spec.handoff.message} ${fill(guardrails.messages.outsideHoursSuffix, spec)}`;
}

export async function respond(input: AgentInput): Promise<AgentDecision> {
  const { spec, inbound, guardrails, now } = input;
  const flags: string[] = [];
  const handoff = (reason: HandoffReason, usage: Usage = NO_USAGE, text?: string): AgentDecision => ({
    action: 'handoff',
    reason,
    text: text ?? handoffText(spec, now, guardrails),
    usage,
    flags,
  });

  // 1. Reglas previas al modelo (deterministas).
  if (asksForHuman(inbound, spec.handoff.keywords)) return handoff('requested_by_contact');
  if (spec.handoff.onComplaint && detectComplaint(inbound, guardrails)) return handoff('complaint');
  if (input.agentTurns >= spec.handoff.maxAgentTurns) return handoff('low_confidence');
  if (input.tokensLeft !== undefined && input.tokensLeft <= 0) return handoff('limit_reached');
  if (detectInjection(inbound, guardrails)) {
    flags.push('injection_attempt');
    return {
      action: 'reply',
      text: fill(guardrails.messages.injectionRefusal, spec),
      intent: 'out_of_scope',
      mentionedProducts: [],
      usage: NO_USAGE,
      flags,
    };
  }

  // 2. Contexto: solo los fragmentos relevantes del catálogo del propio espacio.
  const retrieved: KnowledgeItem[] = await input.retriever.search(inbound, guardrails.retrievalTopK);
  const catalogTitles = await input.retriever.titles();
  const system = buildSystemPrompt(spec, retrieved);

  // 3. El modelo propone una respuesta estructurada.
  let raw: unknown;
  let usage: Usage = NO_USAGE;
  try {
    const response = await input.provider.complete({
      system,
      messages: [...input.history.slice(-8), { role: 'user', content: wrapCustomerMessage(inbound) }],
      maxOutputTokens: Math.ceil(spec.limits.maxReplyChars / 2) + 120,
    });
    raw = response.output;
    usage = response.usage;
  } catch {
    flags.push('provider_error');
    return handoff('error');
  }
  const parsed = OutputSchema.safeParse(raw);
  if (!parsed.success) {
    flags.push('invalid_output');
    return handoff('error', usage);
  }
  const output: ModelOutput = {
    reply: parsed.data.reply.trim(),
    intent: parsed.data.intent,
    mentionedProducts: parsed.data.mentionedProducts,
    leadInterest: parsed.data.leadInterest ?? undefined,
  };

  // 4. Controles de salida: si algo falla, la respuesta del modelo no sale.
  const check = checkOutput(
    output,
    {
      retrieved,
      catalogTitles,
      systemPrompt: buildRules(spec),
      maxChars: spec.limits.maxReplyChars,
      allowPrices: spec.catalog.allowPriceQuotes,
    },
    guardrails,
  );
  if (!check.ok) {
    flags.push(...check.violations);
    return handoff('guardrail', usage, guardrails.messages.guardrailFallback);
  }
  if (output.intent === 'handoff') return handoff('low_confidence', usage, output.reply || undefined);
  if (output.intent === 'out_of_scope') flags.push('out_of_scope');

  // 5. La primera respuesta se presenta como asistente automático.
  const text = input.isFirstReply ? `${spec.assistant.disclosure}\n\n${output.reply}` : output.reply;
  return {
    action: 'reply',
    text,
    intent: output.intent,
    mentionedProducts: output.mentionedProducts,
    leadInterest: spec.leads.capture && (output.intent === 'lead' || output.leadInterest)
      ? output.leadInterest
      : undefined,
    usage,
    flags,
  };
}

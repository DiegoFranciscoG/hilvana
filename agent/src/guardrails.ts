/**
 * Controles deterministas alrededor del modelo (T-06):
 *  - entrada: detección de inyección de instrucciones (LLM01) y pedidos de persona o quejas;
 *  - salida: precios y productos anclados al catálogo (LLM09), sin fuga del prompt (LLM07),
 *    sin enlaces ni marcado no permitidos (LLM05) y con largo acotado (LLM10).
 * Si un control falla, el mensaje del modelo no sale: se envía un texto seguro y se deriva.
 */
import type { KnowledgeItem } from './knowledge.ts';
import { normalizeText, tokens } from './knowledge.ts';

export interface GuardrailConfig {
  injectionPatterns: string[];
  complaintPatterns: string[];
  availabilityClaims: string[];
  messages: { injectionRefusal: string; guardrailFallback: string; outsideHoursSuffix: string };
  allowedLinkHosts: string[];
  minSystemPromptLeakChars: number;
  retrievalTopK: number;
}

export async function loadGuardrails(): Promise<GuardrailConfig> {
  return JSON.parse(await Deno.readTextFile(new URL('../config/guardrails.json', import.meta.url)));
}

const compile = (patterns: string[]) => patterns.map((p) => new RegExp(p, 'iu'));

export function detectInjection(text: string, config: GuardrailConfig): boolean {
  const normalized = text.normalize('NFKC');
  return compile(config.injectionPatterns).some((re) => re.test(normalized));
}

export function detectComplaint(text: string, config: GuardrailConfig): boolean {
  return compile(config.complaintPatterns).some((re) => re.test(text));
}

export function asksForHuman(text: string, keywords: string[]): boolean {
  const normalized = ` ${normalizeText(text)} `;
  return keywords.some((keyword) => normalized.includes(` ${normalizeText(keyword)} `));
}

const MONEY = [
  /(?:US\$|USD|\$|S\/\.?|PEN|€|EUR)\s?(\d{1,6}(?:[.,]\d{1,2})?)/giu,
  /(\d{1,6}(?:[.,]\d{1,2})?)\s?(?:USD|d[oó]lares?|soles?|PEN|EUR|euros?|ctvs?|centavos)/giu,
  /(?:cuesta|cuestan|vale|valen|precio\s+(?:es\s+)?(?:de\s+)?|a\s+solo|por\s+solo)\s+(\d{1,6}(?:[.,]\d{1,2})?)\b/giu,
];

/** Montos mencionados en un texto (con moneda explícita). */
export function extractAmounts(text: string): number[] {
  const found: number[] = [];
  for (const re of MONEY) {
    for (const match of text.matchAll(re)) found.push(Number(match[1].replace(',', '.')));
  }
  return found;
}

export interface OutputCheck {
  ok: boolean;
  violations: string[];
}

export interface ModelOutput {
  reply: string;
  intent: 'answer' | 'handoff' | 'lead' | 'out_of_scope';
  mentionedProducts: string[];
  leadInterest?: string;
}

function sameProduct(name: string, title: string): boolean {
  const a = new Set(tokens(name));
  const b = new Set(tokens(title));
  if (a.size === 0 || b.size === 0) return false;
  const shared = [...a].filter((t) => b.has(t)).length;
  return shared / Math.min(a.size, b.size) >= 0.6;
}

export function checkOutput(
  output: ModelOutput,
  context: {
    retrieved: KnowledgeItem[];
    catalogTitles: string[];
    systemPrompt: string;
    maxChars: number;
    allowPrices: boolean;
  },
  config: GuardrailConfig,
): OutputCheck {
  const violations: string[] = [];
  const reply = output.reply;

  // Precios: cada monto debe ser exactamente el precio de un ítem recuperado del catálogo; si la
  // respuesta declara productos, el precio tiene que ser de esos productos.
  const mentioned = context.retrieved.filter((item) =>
    output.mentionedProducts.some((p) => sameProduct(p, item.title))
  );
  const priced = (output.mentionedProducts.length > 0 ? mentioned : context.retrieved)
    .filter((i) => typeof i.price === 'number');
  const prices = priced.map((i) => i.price as number);
  for (const amount of extractAmounts(reply)) {
    if (!context.allowPrices) violations.push(`price_not_allowed:${amount}`);
    else if (!prices.some((p) => Math.abs(p - amount) < 0.005)) violations.push(`price_not_in_catalog:${amount}`);
  }

  // Productos: los que el modelo declara mencionar deben existir en el catálogo del negocio.
  for (const product of output.mentionedProducts) {
    if (!context.catalogTitles.some((title) => sameProduct(product, title))) {
      violations.push(`unknown_product:${product}`);
    }
  }
  // Afirmar disponibilidad sin nombrar un producto del catálogo también es inventar.
  const claims = compile(config.availabilityClaims).some((re) => re.test(reply));
  if (claims && output.intent !== 'out_of_scope' && output.mentionedProducts.length === 0) {
    violations.push('availability_without_product');
  }

  // Fuga de las reglas: ningún tramo largo de las instrucciones puede aparecer en la respuesta.
  // (El catálogo, el horario y las políticas sí son públicos y no cuentan como fuga.)
  const window = config.minSystemPromptLeakChars;
  const prompt = context.systemPrompt.replace(/\s+/g, ' ');
  const flatReply = reply.replace(/\s+/g, ' ');
  for (let i = 0; i + window <= prompt.length; i += Math.floor(window / 2)) {
    if (flatReply.includes(prompt.slice(i, i + window))) {
      violations.push('system_prompt_leak');
      break;
    }
  }
  if (/\b(BEGIN|END)_(CATALOG|RULES|SPEC)\b|<\/?(system|catalogo|reglas)>/i.test(reply)) {
    violations.push('internal_marker');
  }

  // Enlaces y marcado: solo hosts permitidos; nada de HTML.
  for (const match of reply.matchAll(/https?:\/\/([^\s/]+)/gi)) {
    if (!config.allowedLinkHosts.includes(match[1].toLowerCase())) violations.push(`link_not_allowed:${match[1]}`);
  }
  if (/<[a-z][^>]*>/i.test(reply)) violations.push('html_markup');
  if (reply.trim().length === 0 || reply.length > context.maxChars) violations.push('length');

  return { ok: violations.length === 0, violations };
}

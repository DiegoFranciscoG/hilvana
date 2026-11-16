/**
 * Anonimización antes de guardar (T-08). Enfoque de lista blanca: solo sobreviven los valores
 * de campos tipo "enumeración" (object, type, status…) que además cumplen un patrón estricto.
 * Todo lo demás se reemplaza por un marcador que conserva la forma (tipo y formato), nunca el dato.
 */

export interface LabConfig {
  keepValueKeys: string[];
  keepValuePattern: string;
  phoneKeys: string[];
  nameKeys: string[];
  emailKeys: string[];
  textKeys: string[];
  urlKeys: string[];
  maxArrayItems: number;
  learningSamples: number;
  maxSamplesPerContract: number;
}

export const PLACEHOLDERS = {
  phone: '<phone>',
  name: '<name>',
  email: '<email>',
  text: '<text>',
  id: '<id>',
  url: '<url>',
  numeric: '<numeric>',
  datetime: '1970-01-01T00:00:00Z',
} as const;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /\+?\d[\d\s().-]{5,}\d/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const NUMERIC = /^-?\d+(\.\d+)?$/;
const URL_LIKE = /^https?:\/\//i;

export async function loadLabConfig(): Promise<LabConfig> {
  return JSON.parse(await Deno.readTextFile(new URL('../config/lab.json', import.meta.url))) as LabConfig;
}

function classifyByKey(key: string, config: LabConfig): string | null {
  const k = key.toLowerCase();
  if (config.phoneKeys.includes(k)) return PLACEHOLDERS.phone;
  if (config.nameKeys.includes(k)) return PLACEHOLDERS.name;
  if (config.emailKeys.includes(k)) return PLACEHOLDERS.email;
  if (config.urlKeys.includes(k)) return PLACEHOLDERS.url;
  if (config.textKeys.includes(k)) return PLACEHOLDERS.text;
  if (k === 'id' || k === 'mid' || k.endsWith('_id') || k.endsWith('_ids')) return PLACEHOLDERS.id;
  return null;
}

function maskString(key: string, value: string, config: LabConfig, keepPattern: RegExp): string {
  if (config.keepValueKeys.includes(key.toLowerCase()) && keepPattern.test(value)) return value;
  // Primero el significado del campo; luego el formato del valor. El valor nunca se conserva.
  const byKey = classifyByKey(key, config);
  if (byKey) return byKey;
  if (ISO_DATETIME.test(value)) return PLACEHOLDERS.datetime;
  if (EMAIL.test(value)) return PLACEHOLDERS.email;
  if (URL_LIKE.test(value)) return PLACEHOLDERS.url;
  if (NUMERIC.test(value)) return PLACEHOLDERS.numeric;
  if (PHONE.test(value)) return PLACEHOLDERS.phone;
  return PLACEHOLDERS.text;
}

function maskKey(key: string): string {
  return EMAIL.test(key) || PHONE.test(key) ? '<key>' : key;
}

export function anonymize(value: unknown, config: LabConfig, key = ''): unknown {
  const keepPattern = new RegExp(config.keepValuePattern);
  const walk = (node: unknown, nodeKey: string): unknown => {
    if (node === null || typeof node === 'boolean') return node;
    if (typeof node === 'number') return Number.isInteger(node) ? 0 : 0.5;
    if (typeof node === 'string') return maskString(nodeKey, node, config, keepPattern);
    if (Array.isArray(node)) return node.slice(0, config.maxArrayItems).map((item) => walk(item, nodeKey));
    if (typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[maskKey(k)] = walk(v, k);
      return out;
    }
    return null;
  };
  return walk(value, key);
}

/** Detectores usados por las pruebas y por la verificación previa a guardar. */
export function findPersonalData(serialized: string): string[] {
  const findings: string[] = [];
  const text = serialized.split(PLACEHOLDERS.datetime).join('');
  const emails = text.match(new RegExp(EMAIL.source, 'gi')) ?? [];
  findings.push(...emails.map((e) => `email:${e}`));
  const phones = text.match(/\+?\d[\d\s().-]{5,}\d/g) ?? [];
  findings.push(...phones.map((p) => `phone:${p}`));
  return findings;
}

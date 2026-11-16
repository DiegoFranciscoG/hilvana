/**
 * Configurador: conversa con el dueño del negocio pregunta a pregunta y arma la especificación
 * del agente (T-05). El análisis de respuestas es determinista; las preguntas viven en
 * agent/config/configurator.json.
 */
import { normalizeText } from './knowledge.ts';
import { type AgentSpec, DAYS, validateSpec } from './spec.ts';

type Day = typeof DAYS[number];

export interface Question {
  id: string;
  ask: string;
  field: string;
  parser: 'text' | 'country' | 'enum' | 'hours' | 'policy' | 'list' | 'yesno';
  min?: number;
  max?: number;
  options?: Record<string, string[]>;
  topic?: string;
  skipWords?: string[];
}

export interface ConfiguratorConfig {
  questions: Question[];
  countries: Record<string, string>;
  countryDefaults: Record<string, { currency: string; timezone: string }>;
  days: Record<string, Day>;
  yes: string[];
  no: string[];
  defaults: Record<string, unknown>;
}

export interface InterviewState {
  step: number;
  answers: Record<string, unknown>;
}

export type InterviewTurn =
  | { done: false; state: InterviewState; prompt: string; error?: string }
  | { done: true; state: InterviewState; spec: AgentSpec }
  | { done: true; state: InterviewState; issues: string[] };

export async function loadConfiguratorConfig(): Promise<ConfiguratorConfig> {
  return JSON.parse(await Deno.readTextFile(new URL('../config/configurator.json', import.meta.url)));
}

function template(text: string, answers: Record<string, unknown>): string {
  return text.replace(/\{([a-z.]+)\}/gi, (_, path: string) => String(answers[path] ?? `{${path}}`));
}

export function startInterview(config: ConfiguratorConfig): InterviewTurn {
  const state = { step: 0, answers: {} };
  return { done: false, state, prompt: template(config.questions[0].ask, state.answers) };
}

const TIME = /(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|am|pm)?/g;

function toTime(hour: string, minute: string | undefined): string | null {
  const h = Number(hour);
  const m = Number(minute ?? '0');
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseHours(text: string, config: ConfiguratorConfig): { day: Day; open: string; close: string }[] | null {
  const slots: { day: Day; open: string; close: string }[] = [];
  // "lunes a viernes 9-18 y sábado 9-13" son dos tramos; "sábado y domingo 10-14" es uno solo.
  const rawSegments = text.split(/[,;\n]/).flatMap((part) => {
    const pieces = part.split(/\by\b/i);
    return pieces.length > 1 && pieces.every((p) => (p.match(/\d{1,2}/g) ?? []).length >= 2) ? pieces : [part];
  });
  for (const raw of rawSegments) {
    const prepared = raw
      .replace(/(\d)[.](\d)/g, '$1:$2')
      .replace(/([a-záéíóú]{3,})\s*-\s*([a-záéíóú]{3,})/gi, '$1 a $2')
      .replace(/:/g, ' colon ');
    const segment = normalizeText(prepared).replace(/ colon /g, ':').trim();
    if (!segment) continue;
    const times = [...segment.matchAll(TIME)].map((m) => toTime(m[1], m[2])).filter((t): t is string => t !== null);
    if (times.length < 2) return null;
    const [open, close] = times;
    let days: Day[] = [];
    if (/todos los dias|diario|toda la semana/.test(segment)) days = [...DAYS];
    else {
      const found = segment.split(/\s+/).map((w) => config.days[w]).filter((d): d is Day => Boolean(d));
      if (found.length === 0) return null;
      if (found.length >= 2 && /\b(a|al|hasta)\b|-/.test(segment.split(/\d/)[0])) {
        const start = DAYS.indexOf(found[0]);
        const end = DAYS.indexOf(found[1]);
        days = start <= end ? DAYS.slice(start, end + 1) : [];
      } else days = found;
    }
    if (days.length === 0 || open >= close) return null;
    for (const day of days) slots.push({ day, open, close });
  }
  return slots.length ? slots : null;
}

function parseAnswer(question: Question, text: string, config: ConfiguratorConfig): { ok: true; value: unknown } | { ok: false; error: string } | { ok: true; skip: true } {
  const trimmed = text.trim();
  const normalized = normalizeText(trimmed);
  if (question.skipWords?.some((w) => normalizeText(w) === normalized)) return { ok: true, skip: true };
  switch (question.parser) {
    case 'text': {
      const min = question.min ?? 1;
      const max = question.max ?? 200;
      if (trimmed.length < min || trimmed.length > max) return { ok: false, error: `Escribe entre ${min} y ${max} caracteres.` };
      return { ok: true, value: trimmed };
    }
    case 'country': {
      const code = config.countries[normalized] ?? config.countries[trimmed.toLowerCase()];
      return code ? { ok: true, value: code } : { ok: false, error: 'No reconocí el país. Prueba con su nombre, por ejemplo "Ecuador" o "Perú".' };
    }
    case 'enum': {
      for (const [value, synonyms] of Object.entries(question.options ?? {})) {
        if (synonyms.some((s) => normalized.includes(normalizeText(s)))) return { ok: true, value };
      }
      return { ok: false, error: `Elige una opción: ${Object.keys(question.options ?? {}).join(', ')}.` };
    }
    case 'hours': {
      const slots = parseHours(trimmed, config);
      return slots ? { ok: true, value: slots } : { ok: false, error: 'No entendí el horario. Ejemplo: lunes a viernes 08:00-18:00.' };
    }
    case 'policy': {
      if (config.no.some((n) => normalizeText(n) === normalized)) return { ok: true, skip: true };
      if (trimmed.length < 2) return { ok: false, error: 'Cuéntame un poco más o escribe "no".' };
      return { ok: true, value: { topic: question.topic ?? 'general', text: trimmed.slice(0, 1000) } };
    }
    case 'list': {
      const items = trimmed.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 30);
      return items.length ? { ok: true, value: items } : { ok: false, error: 'Escribe al menos una palabra.' };
    }
    case 'yesno': {
      if (config.yes.some((y) => normalizeText(y) === normalized)) return { ok: true, value: true };
      if (config.no.some((n) => normalizeText(n) === normalized)) return { ok: true, value: false };
      return { ok: false, error: 'Responde sí o no.' };
    }
  }
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) {
    node[key] = (node[key] as Record<string, unknown>) ?? {};
    node = node[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (Array.isArray(node[last]) && !Array.isArray(value)) (node[last] as unknown[]).push(value);
  else node[last] = value;
}

export function buildSpec(config: ConfiguratorConfig, answers: Record<string, unknown>): ReturnType<typeof validateSpec> {
  const spec = structuredClone(config.defaults) as Record<string, unknown>;
  for (const question of config.questions) {
    if (question.id in answers) setPath(spec, question.field, answers[question.id]);
  }
  const business = spec.business as Record<string, unknown>;
  const regional = config.countryDefaults[String(business.country)];
  if (regional) Object.assign(business, regional);
  const names = { 'business.name': business.name };
  const assistant = spec.assistant as Record<string, string>;
  for (const key of ['displayName', 'disclosure', 'greeting']) assistant[key] = template(assistant[key], names);
  return validateSpec(spec);
}

export function answerInterview(config: ConfiguratorConfig, state: InterviewState, text: string): InterviewTurn {
  const question = config.questions[state.step];
  const parsed = parseAnswer(question, text, config);
  if (!parsed.ok) return { done: false, state, prompt: template(question.ask, state.answers), error: parsed.error };
  const answers = { ...state.answers };
  if (!('skip' in parsed)) answers[question.id] = parsed.value;
  if (question.id === 'business_name') answers['business.name'] = (parsed as { value: unknown }).value;
  const next = { step: state.step + 1, answers };
  if (next.step < config.questions.length) {
    return { done: false, state: next, prompt: template(config.questions[next.step].ask, answers) };
  }
  const result = buildSpec(config, answers);
  return result.ok ? { done: true, state: next, spec: result.spec } : { done: true, state: next, issues: result.issues };
}

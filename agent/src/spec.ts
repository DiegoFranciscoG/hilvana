/**
 * Especificación del agente de un negocio (agent_spec.spec). La valida la app, el Telar y la CLI
 * con el mismo esquema; el JSON Schema exportado vive en agent/schema/agent-spec.schema.json.
 */
import { z } from 'zod';

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora HH:MM');
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const AgentSpecSchema = z.strictObject({
  version: z.literal(1),
  business: z.strictObject({
    name: z.string().trim().min(2).max(120),
    industry: z.string().trim().min(2).max(60),
    country: z.string().regex(/^[A-Z]{2}$/),
    timezone: z.string().min(3).max(64),
    currency: z.string().regex(/^[A-Z]{3}$/),
    languages: z.array(z.string().regex(/^[a-z]{2}$/)).min(1).max(5),
  }),
  assistant: z.strictObject({
    displayName: z.string().trim().min(2).max(80),
    tone: z.enum(['cercano', 'formal', 'neutral']),
    greeting: z.string().max(300),
    // Siempre se identifica como asistente automático ante el cliente final (#25).
    disclosure: z.string().min(10).max(300).regex(/autom[aá]tic|automated|automatic/i, 'debe decir que es automático'),
  }),
  hours: z.strictObject({
    weekly: z.array(z.strictObject({ day: z.enum(DAYS), open: Time, close: Time })).max(14),
    outsideHoursMessage: z.string().max(300),
  }),
  catalog: z.strictObject({
    source: z.enum(['manual', 'shopify']),
    allowPriceQuotes: z.boolean(),
  }),
  policies: z.array(
    z.strictObject({ topic: z.string().trim().min(2).max(60), text: z.string().trim().min(2).max(1000) }),
  )
    .max(20),
  handoff: z.strictObject({
    keywords: z.array(z.string().trim().min(2).max(40)).max(30),
    onComplaint: z.boolean(),
    maxAgentTurns: z.number().int().min(1).max(50),
    message: z.string().trim().min(5).max(300),
  }),
  leads: z.strictObject({
    capture: z.boolean(),
    fields: z.array(z.enum(['name', 'interest', 'budget', 'preferred_contact_time'])).max(4),
  }),
  limits: z.strictObject({
    maxReplyChars: z.number().int().min(80).max(1000),
  }),
}).refine((spec) => spec.hours.weekly.every((slot) => slot.open < slot.close), {
  message: 'cada horario debe abrir antes de cerrar',
  path: ['hours', 'weekly'],
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;

export type SpecValidation = { ok: true; spec: AgentSpec } | { ok: false; issues: string[] };

export function validateSpec(input: unknown): SpecValidation {
  const result = AgentSpecSchema.safeParse(input);
  if (result.success) return { ok: true, spec: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`),
  };
}

export function specJsonSchema(): unknown {
  return z.toJSONSchema(AgentSpecSchema);
}

/** ¿El negocio atiende ahora? Usa la zona horaria del negocio. */
export function isOpen(spec: AgentSpec, now: Date): boolean {
  if (spec.hours.weekly.length === 0) return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: spec.business.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value.toLowerCase().slice(0, 3);
  const time = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`;
  return spec.hours.weekly.some((slot) => slot.day === weekday && slot.open <= time && time < slot.close);
}

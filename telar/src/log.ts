/**
 * Registro estructurado en JSON con censura (T-04): ninguna clave, token ni contraseña llega a los
 * registros, ni por nombre de campo ni por forma del valor. Los cuerpos de mensajes no se registran.
 */

const SENSITIVE_KEY = /(secret|token|password|passwd|authorization|api[-_]?key|cookie|signature|hmac|credential)/i;
const SENSITIVE_VALUE: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /\bEAA[A-Za-z0-9]{20,}\b/g, // token de Meta
  /\bshp(at|ss|ca|pa)_[A-Fa-f0-9]{20,}\b/g, // tokens de Shopify
  /\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}\b/g, // claves de Supabase
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // claves de proveedores de IA
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, // bloques largos tipo base64
];

export function redactText(text: string): string {
  return SENSITIVE_VALUE.reduce((acc, re) => acc.replace(re, '[redacted]'), text);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map((
        [k, v],
      ) => [k, SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)]),
    );
  }
  return value;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel = 'info', sink: (line: string) => void = (l) => console.log(l)): Logger {
  const emit = (lvl: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    if (LEVELS[lvl] < LEVELS[level]) return;
    sink(
      JSON.stringify({
        time: new Date().toISOString(),
        level: lvl,
        event,
        ...(redact(fields) as Record<string, unknown>),
      }),
    );
  };
  return {
    debug: (e, f) => emit('debug', e, f),
    info: (e, f) => emit('info', e, f),
    warn: (e, f) => emit('warn', e, f),
    error: (e, f) => emit('error', e, f),
  };
}

/**
 * `hilvana init`: completa .env con secretos aleatorios para el entorno local. Nunca sobrescribe un
 * valor existente ni imprime secretos. Las claves anon/service_role de Supabase autoalojado son JWT
 * firmados con JWT_SECRET (HS256).
 */
import { bytesToBase64 } from '../../telar/connectors/crypto.ts';

const RANDOM_HEX: Record<string, number> = {
  POSTGRES_PASSWORD: 24,
  JWT_SECRET: 32,
  TELAR_DB_PASSWORD: 24,
  REALTIME_SECRET_KEY_BASE: 32,
  TELAR_DRAIN_TOKEN: 24,
};

export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Contraseña de demo que cumple la regla de Auth (minúsculas, mayúsculas y dígitos, 10+). */
export function demoPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => alphabet[b % alphabet.length]).join('');
  return `Hv${random}7k`;
}

function b64url(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signHs256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

export function parseEnv(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) map.set(match[1], match[2].replace(/^["']|["']$/g, ''));
  }
  return map;
}

/**
 * Toma el .env actual (o .env.example) y rellena los secretos vacíos. Devuelve el texto nuevo y la
 * lista de claves añadidas (sin sus valores).
 */
export async function completeEnv(template: string, nowSeconds: number): Promise<{ text: string; added: string[] }> {
  const values = parseEnv(template);
  const added: string[] = [];
  const set = (key: string, value: string) => {
    if (!values.get(key)) {
      values.set(key, value);
      added.push(key);
    }
  };
  for (const [key, bytes] of Object.entries(RANDOM_HEX)) set(key, randomHex(bytes));
  set('REALTIME_DB_ENC_KEY', randomHex(8)); // 16 caracteres exactos
  set('DEMO_PASSWORD', demoPassword());
  const secret = values.get('JWT_SECRET')!;
  const exp = nowSeconds + 5 * 365 * 24 * 3600;
  set('ANON_KEY', await signHs256({ role: 'anon', iss: 'supabase', iat: nowSeconds, exp }, secret));
  set('SERVICE_ROLE_KEY', await signHs256({ role: 'service_role', iss: 'supabase', iat: nowSeconds, exp }, secret));

  const lines = template.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    return match && added.includes(match[1]) ? `${match[1]}=${values.get(match[1])}` : line;
  });
  for (const key of added) {
    if (!lines.some((line) => line.startsWith(`${key}=`))) lines.push(`${key}=${values.get(key)}`);
  }
  return { text: lines.join('\n').replace(/\n*$/, '\n'), added };
}

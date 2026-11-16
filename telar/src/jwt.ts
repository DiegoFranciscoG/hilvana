/**
 * Verificación de los JWT de Supabase Auth con Web Crypto: claves asimétricas publicadas en JWKS
 * (ES256/RS256) o, en autoalojado, secreto compartido HS256. Se validan firma, expiración, audiencia
 * y rol; el `sub` es el id del usuario.
 */
import { base64ToBytes, timingSafeEqual } from '../connectors/crypto.ts';

export interface VerifiedUser {
  userId: string;
  email?: string;
  sessionId?: string;
}

interface Jwk extends JsonWebKey {
  kid?: string;
  alg?: string;
}

function b64url(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bytes = base64ToBytes(padded);
  if (!bytes) throw new Error('invalid base64url');
  return bytes;
}

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64url(segment)));
}

export class JwtVerifier {
  #jwks: Jwk[] = [];
  #jwksFetchedAt = 0;

  constructor(
    private readonly options: {
      supabaseUrl: string;
      jwtSecret?: string;
      fetch?: typeof fetch;
      now?: () => number;
      jwksTtlMs?: number;
    },
  ) {}

  async #keys(force = false): Promise<Jwk[]> {
    const ttl = this.options.jwksTtlMs ?? 600_000;
    const now = (this.options.now ?? Date.now)();
    if (!force && this.#jwks.length && now - this.#jwksFetchedAt < ttl) return this.#jwks;
    const response = await (this.options.fetch ?? fetch)(`${this.options.supabaseUrl}/auth/v1/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`JWKS ${response.status}`);
    const body = await response.json() as { keys?: Jwk[] };
    this.#jwks = body.keys ?? [];
    this.#jwksFetchedAt = now;
    return this.#jwks;
  }

  async verify(token: string): Promise<VerifiedUser | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let header: Record<string, unknown>;
    let payload: Record<string, unknown>;
    try {
      header = decodeJson(parts[0]);
      payload = decodeJson(parts[1]);
    } catch {
      return null;
    }
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    let signature: Uint8Array;
    try {
      signature = b64url(parts[2]);
    } catch {
      return null;
    }
    const valid = header.alg === 'HS256'
      ? await this.#verifyHmac(data, signature)
      : await this.#verifyAsymmetric(String(header.alg), String(header.kid ?? ''), data, signature);
    if (!valid) return null;

    const now = Math.floor((this.options.now ?? Date.now)() / 1000);
    const leeway = 30;
    if (typeof payload.exp !== 'number' || payload.exp + leeway < now) return null;
    if (typeof payload.nbf === 'number' && payload.nbf - leeway > now) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes('authenticated') || payload.role !== 'authenticated') return null;
    const sub = String(payload.sub ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) return null;
    return {
      userId: sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      sessionId: typeof payload.session_id === 'string' ? payload.session_id : undefined,
    };
  }

  async #verifyHmac(data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    if (!this.options.jwtSecret) return false;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.options.jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, data as BufferSource));
    return timingSafeEqual(expected, signature);
  }

  async #verifyAsymmetric(alg: string, kid: string, data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    if (alg !== 'ES256' && alg !== 'RS256') return false;
    let keys = await this.#keys();
    let jwk = keys.find((k) => k.kid === kid);
    if (!jwk) {
      keys = await this.#keys(true);
      jwk = keys.find((k) => k.kid === kid);
    }
    if (!jwk) return false;
    const algorithm = alg === 'ES256'
      ? { import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } }
      : { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } };
    const { kid: _kid, alg: _alg, ...material } = jwk;
    const key = await crypto.subtle.importKey('jwk', material, algorithm.import, false, ['verify']);
    return crypto.subtle.verify(algorithm.verify, key, signature as BufferSource, data as BufferSource);
  }
}

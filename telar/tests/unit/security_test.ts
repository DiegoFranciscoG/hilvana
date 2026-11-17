import { assert, assertEquals, assertFalse, assertRejects } from '@std/assert';
import { createLogger, redact } from '@hilvana/telar/log.ts';
import { JwtVerifier } from '@hilvana/telar/jwt.ts';
import { loadConfig } from '@hilvana/telar/config.ts';
import { RateLimiter } from '@hilvana/telar/http/rate_limit.ts';

const b64url = (data: Uint8Array | string) =>
  btoa(typeof data === 'string' ? data : String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(
    /=+$/,
    '',
  );

async function signHs256(payload: Record<string, unknown>, secret: string): Promise<string> {
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

const USER = '44444444-4444-4444-8444-444444444444';
const now = 1_794_830_400_000;

Deno.test('T-04 los registros censuran secretos por nombre y por forma', () => {
  const lines: string[] = [];
  const logger = createLogger('debug', (l) => lines.push(l));
  logger.info('prueba', {
    accessToken: 'EAAJZCvalorSecretoDeMeta1234567890',
    nested: { authorization: 'Bearer abc.def.ghi', note: 'token EAAJZCotroSecretoDeMeta1234567890 en texto' },
    // Valores con forma de token armados en ejecución: el repositorio no guarda nada con esa forma.
    shop: ['shp', 'at_', '0123456789abcdef'.repeat(2)].join(''),
    key: 'sb_secret_abcdefghijklmnop',
    error: new Error('fallo con sk-proj-ABCDEFGHIJKLMNOPQRSTUV'),
  });
  const out = lines.join('\n');
  for (
    const secret of [
      'EAAJZCvalorSecreto',
      'EAAJZCotroSecreto',
      'shpat_0123',
      'sb_secret_abc',
      'sk-proj-ABC',
      'abc.def.ghi',
    ]
  ) {
    assertFalse(out.includes(secret), `se filtró ${secret}`);
  }
  assert(out.includes('[redacted]'));
  assertEquals(redact({ ok: 'texto normal', id: 'a1b2' }), { ok: 'texto normal', id: 'a1b2' });
});

Deno.test('JWT HS256 de Supabase: válido, vencido, otro secreto, otro rol', async () => {
  const secret = crypto.randomUUID() + crypto.randomUUID();
  const verifier = new JwtVerifier({ supabaseUrl: 'http://localhost:54321', jwtSecret: secret, now: () => now });
  const claims = {
    sub: USER,
    aud: 'authenticated',
    role: 'authenticated',
    exp: now / 1000 + 600,
    email: 'ana@hilvana.test',
  };
  assertEquals((await verifier.verify(await signHs256(claims, secret)))?.userId, USER);
  assertEquals(await verifier.verify(await signHs256({ ...claims, exp: now / 1000 - 600 }, secret)), null);
  assertEquals(await verifier.verify(await signHs256(claims, crypto.randomUUID() + crypto.randomUUID())), null);
  assertEquals(await verifier.verify(await signHs256({ ...claims, role: 'service_role' }, secret)), null);
  assertEquals(await verifier.verify('no.es.jwt'), null);
});

Deno.test('JWT ES256 con JWKS: verifica con la clave publicada y rechaza otra', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'clave-1', alg: 'ES256' };
  let fetches = 0;
  const verifier = new JwtVerifier({
    supabaseUrl: 'http://localhost:54321',
    now: () => now,
    fetch: () => {
      fetches++;
      return Promise.resolve(Response.json({ keys: [jwk] }));
    },
  });
  const head = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'clave-1' }));
  const body = b64url(
    JSON.stringify({ sub: USER, aud: 'authenticated', role: 'authenticated', exp: now / 1000 + 600 }),
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      new TextEncoder().encode(`${head}.${body}`),
    ),
  );
  assertEquals((await verifier.verify(`${head}.${body}.${b64url(sig)}`))?.userId, USER);
  const tampered = b64url(
    JSON.stringify({ sub: USER, aud: 'authenticated', role: 'authenticated', exp: now / 1000 + 99999 }),
  );
  assertEquals(await verifier.verify(`${head}.${tampered}.${b64url(sig)}`), null);
  assertEquals(fetches, 1, 'las claves se cachean');
});

Deno.test('configuración: sin contraseña de base o con URL insegura no arranca', async () => {
  const env = (values: Record<string, string>) => ({ get: (k: string) => values[k] });
  await assertRejects(
    () => loadConfig(env({ TELAR_DB_HOST: 'db', SUPABASE_URL: 'http://localhost:54321' })),
    Error,
    'TELAR_DB_PASSWORD',
  );
  await assertRejects(
    () =>
      loadConfig(
        env({ TELAR_DB_HOST: 'db.remota.test', TELAR_DB_PASSWORD: 'x', SUPABASE_URL: 'http://supabase.remota.test' }),
      ),
    Error,
    'https',
  );
  await assertRejects(
    () =>
      loadConfig(
        env({
          TELAR_DB_HOST: 'db',
          TELAR_DB_PASSWORD: 'x',
          SUPABASE_URL: 'http://localhost:54321',
          SUPABASE_JWT_SECRET: 'corto',
        }),
      ),
    Error,
    '32',
  );
  const config = await loadConfig(
    env({ TELAR_DB_HOST: 'db.remota.test', TELAR_DB_PASSWORD: 'x', SUPABASE_URL: 'https://proyecto.supabase.co' }),
  );
  assertEquals(config.db.ssl, 'require');
  assertEquals(config.meta.graphApiVersion, 'v27.0');
  assertEquals(config.allowedOrigins, []);
});

Deno.test('limitador por clave: agota la cubeta y se recarga con el tiempo', () => {
  let t = 0;
  const limiter = new RateLimiter(2, () => t);
  assert(limiter.take('a'));
  assert(limiter.take('a'));
  assertFalse(limiter.take('a'));
  assert(limiter.take('b'), 'otra clave no se ve afectada');
  t = 30_000;
  assert(limiter.take('a'));
});

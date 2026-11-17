import { assert, assertEquals, assertFalse, assertMatch, assertStringIncludes } from '@std/assert';
import { type CliDeps, main } from '../src/commands.ts';
import { completeEnv, parseEnv } from '../src/env.ts';
import { deployPlan } from '../src/deploy.ts';
import { psqlLiteral } from '../src/local.ts';
import type { RunOptions } from '../src/runner.ts';
import { findTunnelUrl, tunnelCommand } from '../src/tunnel.ts';

const example = await Deno.readTextFile(new URL('../../.env.example', import.meta.url));

function harness(
  options: {
    stdin?: string;
    answer?: string;
    env?: Record<string, string>;
    files?: Record<string, string>;
    psqlStdout?: string;
  } = {},
) {
  const calls: { command: string[]; options?: RunOptions }[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const files: Record<string, string> = { '.env.example': example, ...options.files };
  const deps: CliDeps = {
    run: (command, opts) => {
      calls.push({ command, options: opts });
      const isPsql = command.includes('psql');
      return Promise.resolve({ code: 0, stdout: isPsql ? options.psqlStdout ?? '[]' : '', stderr: '' });
    },
    io: {
      print: (l) => out.push(l),
      error: (l) => err.push(l),
      ask: () => Promise.resolve(options.answer ?? 'no'),
      readStdin: () => Promise.resolve(options.stdin ?? ''),
    },
    readFile: (path) => Promise.resolve(files[path] ?? null),
    writeFile: (path, text) => {
      files[path] = text;
      return Promise.resolve();
    },
    env: (name) => options.env?.[name],
    fetch: () => Promise.resolve(new Response('ok')),
    versions: { CLOUDFLARED_VERSION: '2026.11.0' },
    platform: 'linux',
  };
  return { deps, calls, out, err, files };
}

Deno.test('init genera secretos que faltan y nunca sobrescribe los existentes', async () => {
  const first = harness();
  assertEquals(await main(['init'], first.deps), 0);
  const env = parseEnv(first.files['.env']);
  assertEquals(env.get('REALTIME_DB_ENC_KEY')?.length, 16);
  assertMatch(env.get('JWT_SECRET')!, /^[0-9a-f]{64}$/);
  assertMatch(env.get('DEMO_PASSWORD')!, /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/);
  const [, payload] = env.get('ANON_KEY')!.split('.');
  assertEquals(JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role, 'anon');
  assertFalse(first.out.join('\n').includes(env.get('JWT_SECRET')!), 'no imprime secretos');

  const second = harness({ files: { '.env': first.files['.env'] } });
  await main(['init'], second.deps);
  assertEquals(parseEnv(second.files['.env']).get('JWT_SECRET'), env.get('JWT_SECRET'));
  assertStringIncludes(second.out.join('\n'), 'ya estaba completo');
});

Deno.test('completeEnv conserva comentarios y claves no secretas', async () => {
  const { text } = await completeEnv('# comentario\nTELAR_PORT=8787\nJWT_SECRET=\n', 1_700_000_000);
  assertStringIncludes(text, '# comentario');
  assertStringIncludes(text, 'TELAR_PORT=8787');
  assertMatch(parseEnv(text).get('JWT_SECRET')!, /^[0-9a-f]{64}$/);
});

Deno.test('connect: el secreto llega por stdin a psql, nunca en la lista de argumentos', async () => {
  // Valores de prueba armados en ejecución (el repositorio no guarda nada con forma de secreto).
  const credentialId = crypto.randomUUID();
  const secret = {
    appSecret: ["app'secret", 'x123456'].join('\\'),
    accessToken: ['EAA', 'access', 'token', 'de', 'prueba'].join('-'),
    verifyToken: ['verificar', '123456'].join('-'),
  };
  const h = harness({ stdin: JSON.stringify(secret), psqlStdout: JSON.stringify([{ id: credentialId }]) });
  const code = await main([
    'connect',
    'meta',
    '--space',
    'panaderia',
    '--label',
    'Meta',
    '--channel',
    'whatsapp',
    '--external-id',
    '110000000000001',
  ], h.deps);
  assertEquals(code, 0);
  const psql = h.calls.filter((c) => c.command.includes('psql'));
  assertEquals(psql.length, 2);
  for (const call of psql) {
    assertFalse(call.command.join(' ').includes('access-token'), 'el secreto no va en argumentos');
  }
  assertStringIncludes(psql[0].options!.stdin!, "\\set secret '");
  // JSON escapa la barra (\\) y psql la vuelve a escapar dentro del literal (\\\\).
  assertStringIncludes(psql[0].options!.stdin!, "app''secret\\\\\\\\x123456");
  assertStringIncludes(h.out.join('\n'), `/telar/webhooks/meta/${credentialId}`);
});

Deno.test('connect: rechaza secretos como argumentos y JSON incompleto', async () => {
  const positional = harness({ stdin: '{}' });
  assertEquals(await main(['connect', 'meta', 'EAAsecreto', '--space', 'x', '--label', 'y'], positional.deps), 1);
  const incomplete = harness({ stdin: '{"appSecret":"12345678"}' });
  assertEquals(await main(['connect', 'meta', '--space', 'x', '--label', 'y'], incomplete.deps), 1);
  assertStringIncludes(incomplete.err.join('\n'), 'accessToken');
});

Deno.test('psqlLiteral escapa comillas y barras y rechaza saltos de línea', () => {
  assertEquals(psqlLiteral("a'b\\c"), "'a''b\\\\c'");
  let threw = false;
  try {
    psqlLiteral('a\nb');
  } catch {
    threw = true;
  }
  assert(threw);
});

const deployArgs = [
  'deploy',
  '--project',
  'hilvana-demo-123',
  '--region',
  'us-central1',
  '--supabase-url',
  'https://abc.supabase.co',
  '--db-host',
  'db.abc.supabase.co',
];

Deno.test('deploy muestra el plan y no ejecuta nada sin confirmación', async () => {
  const env = {
    TELAR_DB_PASSWORD: 'pw-local-123',
    SUPABASE_SECRET_KEY: 'clave-local',
    TELAR_DRAIN_TOKEN: 'token-local',
  };
  const declined = harness({ env, answer: 'no' });
  assertEquals(await main(deployArgs, declined.deps), 0);
  assertEquals(declined.calls.length, 0);
  assertStringIncludes(declined.out.join('\n'), 'gcloud run deploy hilvana-telar');
  assertStringIncludes(declined.out.join('\n'), 'No se ejecutó nada');
});

Deno.test('deploy con confirmación pasa los secretos por stdin y exige las variables', async () => {
  const missing = harness({ answer: 'sí' });
  assertEquals(await main(deployArgs, missing.deps), 1);
  assertStringIncludes(missing.err.join('\n'), 'TELAR_DB_PASSWORD');

  const env = {
    TELAR_DB_PASSWORD: 'pw-local-123',
    SUPABASE_SECRET_KEY: 'clave-local',
    TELAR_DRAIN_TOKEN: 'token-local',
  };
  const confirmed = harness({ env, answer: 'sí' });
  assertEquals(await main(deployArgs, confirmed.deps), 0);
  assert(confirmed.calls.length > 5);
  for (const call of confirmed.calls) {
    for (const value of Object.values(env)) {
      assertFalse(call.command.join(' ').includes(value), 'secreto en argumentos');
    }
  }
  assertEquals(confirmed.calls.filter((c) => c.options?.stdin === 'pw-local-123').length, 1);

  const invalid = harness({ env });
  assertEquals(await main(['deploy', '--project', 'X', '--region', 'aqui'], invalid.deps), 1);
});

Deno.test('plan de despliegue: Cloud Run escala a cero y usa Secret Manager', () => {
  const steps = deployPlan({
    project: 'hilvana-demo-123',
    region: 'us-central1',
    tag: 'v1',
    supabaseUrl: 'https://abc.supabase.co',
    dbHost: 'db.abc.supabase.co',
  });
  const run = steps.find((s) => s.command.includes('deploy'))!.command.join(' ');
  assertStringIncludes(run, '--min-instances=0');
  assertStringIncludes(run, '--set-secrets=TELAR_DB_PASSWORD=hilvana-telar-db-password:latest');
  assertStringIncludes(run, 'us-central1-docker.pkg.dev/hilvana-demo-123/hilvana/telar:v1');
});

Deno.test('túnel: binario local o imagen oficial fijada, y detección de la URL', () => {
  assertEquals(
    tunnelCommand({ port: 8000, hasBinary: true, cloudflaredVersion: '2026.11.0', linux: true })[0],
    'cloudflared',
  );
  const docker = tunnelCommand({ port: 8000, hasBinary: false, cloudflaredVersion: '2026.11.0', linux: true });
  assert(docker.includes('cloudflare/cloudflared:2026.11.0'));
  assert(docker.includes('host.docker.internal:host-gateway'));
  assertEquals(
    findTunnelUrl('INF |  https://lino-hilo-aguja.trycloudflare.com  |'),
    'https://lino-hilo-aguja.trycloudflare.com',
  );
  assertEquals(findTunnelUrl('nada aquí'), null);
});

Deno.test('ayuda y comando desconocido', async () => {
  const h = harness();
  assertEquals(await main([], h.deps), 0);
  assertStringIncludes(h.out.join('\n'), 'hilvana <comando>');
  assertEquals(await main(['volar'], h.deps), 1);
});

/**
 * Comandos de la CLI `hilvana`. Cada comando recibe sus dependencias (ejecutor, E/S, archivos) para
 * probarse sin Docker ni red.
 */
import { parseArgs } from '@std/cli';
import { deployPlan, POST_DEPLOY_NOTES, renderPlan, validateDeployOptions } from './deploy.ts';
import { completeEnv, parseEnv } from './env.ts';
import {
  addChannel,
  COMPOSE,
  contractAlerts,
  createWorkspace,
  listContracts,
  listWorkspaces,
  storeCredential,
  waitForHealthy,
} from './local.ts';
import type { Io, Runner } from './runner.ts';
import { findTunnelUrl, tunnelCommand, webhookInstructions } from './tunnel.ts';

export interface CliDeps {
  run: Runner;
  io: Io;
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, text: string): Promise<void>;
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  versions: Record<string, string>;
  platform: string;
}

export const HELP = `hilvana — base abierta para unir los hilos de tus clientes

Uso: hilvana <comando> [opciones]

  init                      crea o completa .env con secretos aleatorios (no sobrescribe)
  up [--no-build]           levanta todo en local con Docker Compose y datos de demo
  down [--volumes]          detiene los servicios (con --volumes borra los datos locales)
  status                    estado de los servicios y salud del Telar
  tunnel [--port 8000]      túnel HTTPS temporal para recibir webhooks de Meta
  space list                espacios, credenciales y canales
  space create <nombre> --slug <slug> --country EC [--plan starter]
  connect <meta|shopify|ai> --space <slug> --label <texto> [--channel whatsapp|messenger|instagram|shopify --external-id <id>] [--public '<json>']
                            el secreto (JSON) se lee de la entrada estándar, nunca de argumentos
  contracts [--space <slug>] [--alerts]
  deploy --project <id> --region <región> --supabase-url <https://...> --db-host <host> [--tag v1] [--yes]
                            muestra los comandos de Google Cloud y pide confirmación antes de ejecutarlos
`;

const SECRET_SHAPES: Record<string, string[]> = {
  meta: ['appSecret', 'accessToken', 'verifyToken'],
  shopify: ['clientSecret', 'accessToken'],
  ai: ['apiKey'],
};

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const args = parseArgs(argv, {
    string: [
      'port',
      'space',
      'label',
      'channel',
      'external-id',
      'public',
      'slug',
      'country',
      'plan',
      'project',
      'region',
      'tag',
      'supabase-url',
      'db-host',
    ],
    boolean: ['yes', 'volumes', 'no-build', 'alerts', 'help'],
  });
  const [command, sub, ...rest] = args._.map(String);
  const { io, run } = deps;

  switch (command) {
    case undefined:
    case 'help':
      io.print(HELP);
      return 0;

    case 'init': {
      const current = (await deps.readFile('.env')) ?? (await deps.readFile('.env.example'));
      if (current === null) {
        io.error('No encontré .env ni .env.example en esta carpeta.');
        return 1;
      }
      const { text, added } = await completeEnv(current, Math.floor(Date.now() / 1000));
      await deps.writeFile('.env', text);
      io.print(
        added.length
          ? `.env listo. Generé: ${added.join(', ')} (los valores quedan solo en .env).`
          : '.env ya estaba completo.',
      );
      return 0;
    }

    case 'up': {
      if ((await run(['docker', 'version', '--format', '{{.Server.Version}}'])).code !== 0) {
        io.error('Docker no responde. Abre Docker Desktop (o el servicio docker) y vuelve a intentar.');
        return 1;
      }
      const code = await main(['init'], deps);
      if (code !== 0) return code;
      const up = await run([...COMPOSE, 'up', '-d', ...(args['no-build'] ? [] : ['--build'])], { inherit: true });
      if (up.code !== 0) return up.code;
      io.print('Esperando a que el Telar esté listo…');
      const healthy = await waitForHealthy('http://localhost:8000/telar/readyz', 180_000, deps.fetch);
      if (!healthy) {
        io.error('El Telar no respondió a tiempo. Revisa: docker compose logs telar');
        return 1;
      }
      const env = parseEnv((await deps.readFile('.env')) ?? '');
      io.print('Hilvana está en marcha:');
      io.print('  Bandeja web:   http://localhost:8000');
      io.print('  API del Telar: http://localhost:8000/telar/openapi.json');
      io.print(
        `  Usuario demo:  demo@hilvana.test (contraseña en .env, HILVANA_DEMO_PASSWORD${
          env.get('HILVANA_DEMO_PASSWORD') ? '' : ' — falta'
        })`,
      );
      return 0;
    }

    case 'down': {
      const result = await run([...COMPOSE, 'down', ...(args.volumes ? ['--volumes'] : [])], { inherit: true });
      return result.code;
    }

    case 'status': {
      await run([...COMPOSE, 'ps'], { inherit: true });
      const ok = await waitForHealthy('http://localhost:8000/telar/readyz', 3_000, deps.fetch);
      io.print(ok ? 'Telar: listo' : 'Telar: no responde');
      return ok ? 0 : 1;
    }

    case 'tunnel': {
      const port = Number(args.port ?? '8000');
      const hasBinary =
        (await run(['cloudflared', '--version']).catch(() => ({ code: 1, stdout: '', stderr: '' }))).code === 0;
      const cmd = tunnelCommand({
        port,
        hasBinary,
        cloudflaredVersion: deps.versions.CLOUDFLARED_VERSION,
        linux: deps.platform === 'linux',
      });
      io.print(`Abriendo túnel (solo para pruebas): ${cmd.join(' ')}`);
      io.print('Cloudflare imprimirá la URL pública; úsala como base de las URLs de abajo. Ctrl+C para cerrar.');
      const credentials = await listWorkspaces(run).then((rows) => rows.flatMap((w) => w.credentials ?? [])).catch(
        () => [],
      );
      for (const line of webhookInstructions('https://<subdominio>.trycloudflare.com', credentials)) io.print(line);
      const result = await run(cmd, { inherit: true });
      return result.code;
    }

    case 'space': {
      if (sub === 'list' || sub === undefined) {
        const rows = await listWorkspaces(run);
        if (rows.length === 0) io.print('No hay espacios todavía.');
        for (const w of rows) {
          io.print(`${w.slug}  ${w.name}  (${w.country_code}, plan ${w.plan_code})`);
          for (const c of w.credentials ?? []) {
            io.print(`    credencial ${c.provider} ${c.id}  ${c.label} [${c.status}]`);
          }
          for (const ch of w.channels ?? []) io.print(`    canal ${ch.type} ${ch.external_id} [${ch.status}]`);
        }
        return 0;
      }
      if (sub === 'create') {
        const name = rest.join(' ') || '';
        const slug = args.slug ?? '';
        if (
          name.length < 2 || !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) ||
          !/^[A-Za-z]{2}$/.test(args.country ?? '')
        ) {
          io.error('Uso: hilvana space create "Nombre" --slug mi-negocio --country EC');
          return 1;
        }
        const [row] = await createWorkspace(run, { name, slug, country: args.country!, plan: args.plan ?? 'starter' });
        io.print(`Espacio creado: ${slug} (${row.id}). Agrega un dueño desde la app o con add_member().`);
        return 0;
      }
      io.error(HELP);
      return 1;
    }

    case 'connect': {
      const provider = sub;
      if (!provider || !(provider in SECRET_SHAPES) || !args.space || !args.label) {
        io.error(
          'Uso: echo \'{"appSecret":"…","accessToken":"…","verifyToken":"…"}\' | hilvana connect meta --space <slug> --label <texto>',
        );
        return 1;
      }
      if (rest.length > 0) {
        io.error('No pases secretos como argumentos: envíalos por la entrada estándar en JSON.');
        return 1;
      }
      let secret: Record<string, unknown>;
      try {
        secret = JSON.parse(await io.readStdin());
      } catch {
        io.error('La entrada estándar debe ser un JSON con el secreto.');
        return 1;
      }
      const missing = SECRET_SHAPES[provider].filter((k) =>
        typeof secret[k] !== 'string' || (secret[k] as string).length < 8
      );
      if (missing.length) {
        io.error(`Faltan campos del secreto: ${missing.join(', ')}`);
        return 1;
      }
      let publicConfig = '{}';
      if (args.public) {
        try {
          publicConfig = JSON.stringify(JSON.parse(args.public));
        } catch {
          io.error('--public debe ser JSON');
          return 1;
        }
      }
      const [credential] = await storeCredential(run, {
        slug: args.space,
        provider,
        label: args.label,
        secret: JSON.stringify(secret),
        publicConfig,
      });
      if (!credential?.id) {
        io.error(`No existe el espacio ${args.space}.`);
        return 1;
      }
      io.print(`Credencial guardada en Vault: ${credential.id}`);
      if (args.channel && args['external-id']) {
        await addChannel(run, {
          slug: args.space,
          credentialId: credential.id,
          type: args.channel,
          externalId: args['external-id'],
          displayName: args.label,
        });
        io.print(`Canal ${args.channel} ${args['external-id']} conectado.`);
      }
      const path = provider === 'shopify' ? 'shopify' : 'meta';
      if (provider !== 'ai') io.print(`URL de webhook: <URL pública>/telar/webhooks/${path}/${credential.id}`);
      return 0;
    }

    case 'contracts': {
      if (args.alerts) {
        const alerts = await contractAlerts(run, args.space);
        if (alerts.length === 0) io.print('Sin alertas de deriva abiertas.');
        for (const a of alerts) io.print(`[${a.slug}] ${a.created_at}\n${a.summary}\n`);
        return 0;
      }
      const rows = await listContracts(run, args.space);
      if (rows.length === 0) io.print('Todavía no hay contratos: llegan con el primer webhook.');
      for (const c of rows) {
        io.print(
          `${c.slug.padEnd(22)} ${c.event_key.padEnd(34)} v${c.version}  muestras ${c.sample_count}${
            c.open_alerts ? `  alertas ${c.open_alerts}` : ''
          }`,
        );
      }
      return 0;
    }

    case 'deploy': {
      const options = {
        project: args.project ?? '',
        region: args.region ?? '',
        tag: args.tag ?? 'v1',
        supabaseUrl: args['supabase-url'] ?? '',
        dbHost: args['db-host'] ?? '',
      };
      const problems = validateDeployOptions(options);
      if (problems.length) {
        io.error(`No puedo armar el plan: ${problems.join('; ')}`);
        return 1;
      }
      const steps = deployPlan(options);
      io.print('Plan de despliegue en Google Cloud (requiere cuenta de facturación con tarjeta):');
      io.print(renderPlan(steps));
      const missing = steps.filter((s) => s.stdinFromEnv && !deps.env(s.stdinFromEnv)).map((s) => s.stdinFromEnv!);
      if (missing.length) {
        io.error(`Antes de ejecutar define en tu entorno: ${[...new Set(missing)].join(', ')}`);
        return 1;
      }
      const answer = args.yes
        ? 'sí'
        : (await io.ask(`¿Ejecutar estos ${steps.length} pasos en el proyecto ${options.project}? Escribe "sí": `))
          .trim().toLowerCase();
      if (answer !== 'sí' && answer !== 'si') {
        io.print('No se ejecutó nada.');
        return 0;
      }
      for (const step of steps) {
        io.print(`→ ${step.description}`);
        const result = await run(
          step.command,
          step.stdinFromEnv ? { stdin: deps.env(step.stdinFromEnv)! } : { inherit: true },
        );
        if (result.code !== 0 && !step.tolerateFailure) {
          io.error(`Falló: ${step.command.slice(0, 4).join(' ')}…`);
          return result.code;
        }
      }
      for (const line of POST_DEPLOY_NOTES) io.print(line);
      return 0;
    }

    default:
      io.error(`Comando desconocido: ${command}\n${HELP}`);
      return 1;
  }
}

export { findTunnelUrl };

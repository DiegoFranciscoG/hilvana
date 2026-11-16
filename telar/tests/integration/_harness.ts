/**
 * Arnés de integración: Postgres de Supabase real con las migraciones aplicadas (scripts/test-integration.sh).
 * Cada prueba crea sus propios espacios con datos ficticios y los borra al terminar.
 */
import postgres from 'postgres';
import type { QueuedWebhook } from '@hilvana/sdk/envelope.ts';
import { loadGuardrails } from '@hilvana/agent/guardrails.ts';
import { loadLabConfig } from '@hilvana/lab/anonymize.ts';
import { signMetaBody } from '@hilvana/connectors/mod.ts';
import { loadConfig, type TelarConfig } from '@hilvana/telar/config.ts';
import { connect, type Sql, withWorkspace } from '@hilvana/telar/db.ts';
import { createApp } from '@hilvana/telar/http/app.ts';
import { createLogger } from '@hilvana/telar/log.ts';
import { PgApi } from '@hilvana/telar/pg/api.ts';
import { PgIngest } from '@hilvana/telar/pg/ingest.ts';
import { upsertChunk } from '@hilvana/telar/pg/knowledge.ts';
import { WorkspaceDrainer } from '@hilvana/telar/worker/drain.ts';
import { Replier } from '@hilvana/telar/worker/reply.ts';
import type { Sender, SendTarget } from '@hilvana/telar/worker/send.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta ${name} (usa scripts/test-integration.sh)`);
  return value;
};

export const evalData = JSON.parse(await Deno.readTextFile(new URL('../../../agent/evals/conversations.json', import.meta.url)));

export function adminSql(): Sql {
  return postgres({
    host: env('HILVANA_TEST_DB_HOST'),
    port: Number(Deno.env.get('HILVANA_TEST_DB_PORT') ?? '5432'),
    database: 'postgres',
    username: 'postgres',
    password: env('HILVANA_TEST_ADMIN_PASSWORD'),
    max: 4,
    prepare: false,
    onnotice: () => {},
  });
}

export async function telarConfig(): Promise<TelarConfig> {
  const values: Record<string, string> = {
    TELAR_DB_HOST: env('HILVANA_TEST_DB_HOST'),
    TELAR_DB_PORT: Deno.env.get('HILVANA_TEST_DB_PORT') ?? '5432',
    TELAR_DB_PASSWORD: env('HILVANA_TEST_TELAR_PASSWORD'),
    TELAR_DB_SSL: 'disable',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SECRET_KEY: 'clave-de-prueba-local',
    LAB_CAPTURE: 'on',
  };
  return await loadConfig({ get: (k) => values[k] });
}

export interface SentRecord {
  target: SendTarget;
  text: string;
  humanAgentTag: boolean;
}

export async function buildTelar(options: { failSends?: boolean } = {}) {
  const config = await telarConfig();
  const sql = connect(config.db, { max: 8 });
  const logs: string[] = [];
  const logger = createLogger('debug', (line) => logs.push(line));
  const sent: SentRecord[] = [];
  const sender: Sender = (target, content, opts) => {
    if (options.failSends) return Promise.reject(new Error('Graph API 500'));
    sent.push({ target, text: content.kind === 'text' ? content.text : content.name, humanAgentTag: Boolean(opts.humanAgentTag) });
    return Promise.resolve({ externalMessageId: `wamid.salida.${crypto.randomUUID()}` });
  };
  const guardrails = await loadGuardrails();
  const replier = new Replier({ sql, config, guardrails, sender, logger });
  const drainer = new WorkspaceDrainer(sql, { config, labConfig: await loadLabConfig(), logger, replier });
  const authFetches: { url: string; headers: Headers }[] = [];
  const api = new PgApi(sql, {
    config,
    replier,
    guardrails,
    fetch: (input, init) => {
      authFetches.push({ url: String(input), headers: new Headers(init?.headers) });
      return Promise.resolve(new Response(null, { status: 200 }));
    },
  });
  const app = createApp({
    ingest: new PgIngest(sql, 0),
    api,
    drainer,
    verifyUser: (token) => Promise.resolve(token.startsWith('user:') ? { userId: token.slice(5) } : null),
    logger,
    allowedOrigins: [],
    maxWebhookBytes: config.meta.webhookMaxBodyBytes,
    webhookRatePerMinute: 100_000,
  });
  return { config, sql, app, drainer, replier, api, sent, logs, authFetches };
}

export interface TestWorkspace {
  id: string;
  slug: string;
  ownerId: string;
  credentialId: string;
  channelId: string;
  phoneNumberId: string;
  appSecret: string;
}

/** Crea un espacio con dueño, credencial de Meta, canal de WhatsApp, agente publicado y catálogo. */
export async function createWorkspace(admin: Sql, telar: Sql, options: { plan?: string; agent?: boolean } = {}): Promise<TestWorkspace> {
  const tag = crypto.randomUUID().slice(0, 8);
  const slug = `prueba-${tag}`;
  const appSecret = `app-secret-${crypto.randomUUID()}`;
  const phoneNumberId = String(100000000000000 + Math.floor(Math.random() * 1e12));
  const [owner] = await admin<{ id: string }[]>`
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            ${`dueno-${tag}@hilvana.test`}, '{}', '{}', now(), now())
    returning id`;
  const [workspace] = await admin<{ id: string }[]>`
    insert into public.workspace (slug, name, country_code, plan_code) values (${slug}, ${`Negocio ${tag}`}, 'EC', ${options.plan ?? 'starter'})
    returning id`;
  await admin`insert into public.member (workspace_id, user_id, role) values (${workspace.id}, ${owner.id}, 'owner')`;
  const [credential] = await admin<{ id: string }[]>`
    select private.store_credential_admin(${workspace.id}::uuid, 'meta', 'Meta de prueba',
      ${admin.json({ appSecret, accessToken: `token-${tag}-acceso`, verifyToken: `verificar-${tag}` })}::jsonb,
      ${admin.json({ appId: '1234567890' })}::jsonb) as id`;
  const [channel] = await admin<{ id: string }[]>`
    insert into public.channel (workspace_id, credential_id, type, external_id, display_name)
    values (${workspace.id}, ${credential.id}, 'whatsapp', ${phoneNumberId}, 'WhatsApp de prueba') returning id`;
  if (options.agent !== false) {
    const [spec] = await admin<{ id: string }[]>`
      insert into public.agent_spec (workspace_id, version, status, spec, published_at)
      values (${workspace.id}, 1, 'published', ${admin.json(evalData.spec)}, now()) returning id`;
    await admin`update public.workspace set active_agent_spec_id = ${spec.id} where id = ${workspace.id}`;
    await withWorkspace(telar, workspace.id, async (tx) => {
      for (const item of evalData.catalog) {
        await upsertChunk(tx, workspace.id, {
          source: item.source,
          externalRef: item.id,
          title: item.title,
          content: item.content,
          price: item.price ?? undefined,
          currency: item.currency ?? undefined,
          stock: item.stock ?? undefined,
        });
      }
    });
  }
  return { id: workspace.id, slug, ownerId: owner.id, credentialId: credential.id, channelId: channel.id, phoneNumberId, appSecret };
}

export async function dropWorkspace(admin: Sql, ws: TestWorkspace): Promise<void> {
  await admin`delete from public.workspace where id = ${ws.id}`;
  await admin`delete from auth.users where id = ${ws.ownerId}`;
}

/** Webhook de WhatsApp de texto con datos ficticios. */
export function whatsappText(ws: TestWorkspace, text: string, options: { from?: string; wamid?: string; secondsAgo?: number } = {}) {
  const timestamp = Math.floor(Date.now() / 1000) - (options.secondsAgo ?? 5);
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: '102030405060708',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '593990000100', phone_number_id: ws.phoneNumberId },
          contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: options.from ?? '593990000001' }],
          messages: [{
            from: options.from ?? '593990000001',
            id: options.wamid ?? `wamid.${crypto.randomUUID()}`,
            timestamp: String(timestamp),
            type: 'text',
            text: { body: text },
          }],
        },
      }],
    }],
  };
}

export async function postWebhook(app: ReturnType<typeof createApp>, ws: TestWorkspace, payload: unknown, secret = ws.appSecret) {
  const body = JSON.stringify(payload);
  const signature = await signMetaBody(new TextEncoder().encode(body), secret);
  return app.request(`/webhooks/meta/${ws.credentialId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
    body,
  });
}

export async function queueLength(admin: Sql, ws: TestWorkspace): Promise<number> {
  const [row] = await admin<{ n: number }[]>`
    select count(*)::int as n from pgmq.${admin(`q_ws_${ws.id.replaceAll('-', '')}`)}`;
  return row.n;
}

export type { QueuedWebhook };

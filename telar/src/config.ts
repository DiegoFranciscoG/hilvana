/**
 * Configuración del Telar desde el entorno. Si falta un secreto crítico, el proceso no arranca.
 * Los parámetros de negocio (versión de Graph API, ventanas, límites) viven en telar/config/*.json.
 */
import type { ChannelPolicies } from '../connectors/window.ts';

export interface TelarConfig {
  port: number;
  db: { host: string; port: number; database: string; user: string; password: string; ssl: false | 'require' };
  supabaseUrl: string;
  supabaseSecretKey?: string;
  supabaseJwtSecret?: string;
  allowedOrigins: string[];
  publicUrl?: string;
  drainToken?: string;
  labCapture: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  fcm?: { projectId: string; serviceAccountB64: string };
  meta: {
    graphApiVersion: string;
    hosts: Record<'whatsapp' | 'messenger' | 'instagram', string>;
    webhookMaxBodyBytes: number;
  };
  shopify: { apiVersion: string };
  policies: ChannelPolicies;
}

type Env = { get(name: string): string | undefined };

function required(env: Env, name: string): string {
  const value = env.get(name)?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function optional(env: Env, name: string): string | undefined {
  const value = env.get(name)?.trim();
  return value ? value : undefined;
}

async function readJson<T>(relative: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(new URL(`../config/${relative}`, import.meta.url))) as T;
}

export async function loadConfig(env: Env = Deno.env): Promise<TelarConfig> {
  const dbHost = required(env, 'TELAR_DB_HOST');
  const local = ['localhost', '127.0.0.1', 'db', 'host.docker.internal'].includes(dbHost);
  const sslMode = optional(env, 'TELAR_DB_SSL') ?? (local ? 'disable' : 'require');
  if (!['disable', 'require'].includes(sslMode)) throw new Error('TELAR_DB_SSL debe ser disable o require');

  const supabaseUrl = required(env, 'SUPABASE_URL').replace(/\/+$/, '');
  const parsedUrl = new URL(supabaseUrl);
  if (
    parsedUrl.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', 'kong', 'gateway', 'host.docker.internal'].includes(parsedUrl.hostname)
  ) {
    throw new Error('SUPABASE_URL debe usar https fuera de local');
  }
  const jwtSecret = optional(env, 'SUPABASE_JWT_SECRET');
  if (jwtSecret && jwtSecret.length < 32) throw new Error('SUPABASE_JWT_SECRET debe tener al menos 32 caracteres');
  const drainToken = optional(env, 'TELAR_DRAIN_TOKEN');
  if (drainToken && drainToken.length < 32) throw new Error('TELAR_DRAIN_TOKEN debe tener al menos 32 caracteres');

  const fcmProject = optional(env, 'FCM_PROJECT_ID');
  const fcmKey = optional(env, 'FCM_SERVICE_ACCOUNT_B64');
  const level = optional(env, 'LOG_LEVEL') ?? 'info';
  if (!['debug', 'info', 'warn', 'error'].includes(level)) throw new Error('LOG_LEVEL inválido');
  const port = Number(optional(env, 'TELAR_PORT') ?? optional(env, 'PORT') ?? '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('TELAR_PORT inválido');

  return {
    port,
    db: {
      host: dbHost,
      port: Number(optional(env, 'TELAR_DB_PORT') ?? '5432'),
      database: optional(env, 'TELAR_DB_NAME') ?? 'postgres',
      user: optional(env, 'TELAR_DB_USER') ?? 'hilvana_telar',
      password: required(env, 'TELAR_DB_PASSWORD'),
      ssl: sslMode === 'require' ? 'require' : false,
    },
    supabaseUrl,
    supabaseSecretKey: optional(env, 'SUPABASE_SECRET_KEY'),
    supabaseJwtSecret: jwtSecret,
    allowedOrigins: (optional(env, 'TELAR_ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    publicUrl: optional(env, 'TELAR_PUBLIC_URL'),
    drainToken,
    labCapture: (optional(env, 'LAB_CAPTURE') ?? 'on') !== 'off',
    logLevel: level as TelarConfig['logLevel'],
    fcm: fcmProject && fcmKey ? { projectId: fcmProject, serviceAccountB64: fcmKey } : undefined,
    meta: await readJson('meta.json'),
    shopify: await readJson('shopify.json'),
    policies: await readJson('channel-policies.json'),
  };
}

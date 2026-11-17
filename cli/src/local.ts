/**
 * Operaciones locales: Docker Compose y SQL como administrador dentro del contenedor de la base.
 * Los valores viajan como variables de psql (:'nombre'), nunca concatenados en el SQL.
 */
import type { Runner } from './runner.ts';

export const COMPOSE = ['docker', 'compose'];

/** Literal para \set de psql: comillas y barras escapadas; sin saltos de línea. */
export function psqlLiteral(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error('values cannot contain line breaks');
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

export async function sqlJson<T>(run: Runner, sql: string, variables: Record<string, string> = {}): Promise<T> {
  const args = [
    ...COMPOSE,
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  // Las variables (incluidos secretos) viajan por stdin con \set: nunca en la lista de procesos.
  const sets = Object.entries(variables).map(([name, value]) => {
    if (!/^[a-z_]+$/.test(name)) throw new Error('invalid variable name');
    return `\\set ${name} ${psqlLiteral(value)}`;
  });
  const result = await run(args, {
    stdin: [...sets, `select coalesce(json_agg(t), '[]'::json) from (${sql}) t;`].join('\n'),
  });
  if (result.code !== 0) throw new Error(result.stderr.trim().split('\n').pop() ?? 'psql failed');
  return JSON.parse(result.stdout.trim() || '[]') as T;
}

export interface WorkspaceRow {
  slug: string;
  name: string;
  country_code: string;
  plan_code: string;
  credentials: { id: string; provider: string; label: string; status: string }[] | null;
  channels: { type: string; external_id: string; status: string }[] | null;
}

export function listWorkspaces(run: Runner): Promise<WorkspaceRow[]> {
  return sqlJson<WorkspaceRow[]>(
    run,
    `select w.slug, w.name, w.country_code, w.plan_code,
       (select json_agg(json_build_object('id', c.id, 'provider', c.provider, 'label', c.label, 'status', c.status))
          from public.credential c where c.workspace_id = w.id) as credentials,
       (select json_agg(json_build_object('type', ch.type, 'external_id', ch.external_id, 'status', ch.status))
          from public.channel ch where ch.workspace_id = w.id) as channels
     from public.workspace w order by w.slug`,
  );
}

export interface ContractRow {
  slug: string;
  event_key: string;
  version: number;
  sample_count: number;
  open_alerts: number;
}

export function listContracts(run: Runner, slug?: string): Promise<ContractRow[]> {
  return sqlJson<ContractRow[]>(
    run,
    `select w.slug, c.event_key, c.version, c.sample_count,
       (select count(*) from public.contract_alert a where a.contract_id = c.id and a.acknowledged_at is null)::int as open_alerts
     from public.contract c join public.workspace w on w.id = c.workspace_id
     where (:'slug' = '' or w.slug = :'slug')
     order by w.slug, c.event_key, c.version`,
    { slug: slug ?? '' },
  );
}

export function contractAlerts(
  run: Runner,
  slug?: string,
): Promise<{ slug: string; event_key: string; summary: string; created_at: string }[]> {
  return sqlJson(
    run,
    `select w.slug, a.event_key, a.summary, a.created_at
     from public.contract_alert a join public.workspace w on w.id = a.workspace_id
     where a.acknowledged_at is null and (:'slug' = '' or w.slug = :'slug')
     order by a.created_at desc limit 50`,
    { slug: slug ?? '' },
  );
}

export function createWorkspace(
  run: Runner,
  input: { name: string; slug: string; country: string; plan: string },
): Promise<{ id: string }[]> {
  return sqlJson(
    run,
    `insert into public.workspace (name, slug, country_code, plan_code)
     values (:'name', :'slug', upper(:'country'), :'plan') returning id`,
    input,
  );
}

export function storeCredential(
  run: Runner,
  input: { slug: string; provider: string; label: string; secret: string; publicConfig: string },
): Promise<{ id: string }[]> {
  return sqlJson(
    run,
    `select private.store_credential_admin(w.id, :'provider', :'label', (:'secret')::jsonb, (:'public_config')::jsonb) as id
     from public.workspace w where w.slug = :'slug'`,
    {
      slug: input.slug,
      provider: input.provider,
      label: input.label,
      secret: input.secret,
      public_config: input.publicConfig,
    },
  );
}

export function addChannel(
  run: Runner,
  input: { slug: string; credentialId: string; type: string; externalId: string; displayName: string },
): Promise<{ id: string }[]> {
  return sqlJson(
    run,
    `insert into public.channel (workspace_id, credential_id, type, external_id, display_name)
     select w.id, (:'credential_id')::uuid, :'type', :'external_id', :'display_name'
     from public.workspace w where w.slug = :'slug' returning id`,
    {
      slug: input.slug,
      credential_id: input.credentialId,
      type: input.type,
      external_id: input.externalId,
      display_name: input.displayName,
    },
  );
}

/** Espera a que una URL responda 200 (salud del Telar detrás de la pasarela). */
export async function waitForHealthy(url: string, timeoutMs: number, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchFn(url, { signal: AbortSignal.timeout(3_000) });
      await response.body?.cancel();
      if (response.ok) return true;
    } catch {
      // aún arrancando
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return false;
}

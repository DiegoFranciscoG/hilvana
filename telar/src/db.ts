/**
 * Conexión a Postgres con el rol hilvana_telar. Toda operación sobre datos de un negocio corre dentro
 * de withWorkspace(): fija hilvana.workspace_id solo para esa transacción, y RLS hace el resto.
 * SQL siempre parametrizado (plantillas de postgres.js).
 */
import postgres from 'postgres';
import type { TelarConfig } from './config.ts';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, what = 'id'): string {
  if (!UUID.test(value)) throw new Error(`invalid ${what}`);
  return value.toLowerCase();
}

export function connect(config: TelarConfig['db'], options: { max?: number } = {}): Sql {
  return postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.user,
    password: config.password,
    ssl: config.ssl,
    max: options.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Compatible con el pooler de Supabase en modo transacción.
    prepare: false,
    connection: { application_name: 'hilvana-telar' },
    onnotice: () => {},
  });
}

export async function withWorkspace<T>(sql: Sql, workspaceId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const id = assertUuid(workspaceId, 'workspace id');
  return await sql.begin(async (tx) => {
    await tx`select set_config('hilvana.workspace_id', ${id}, true)`;
    return await fn(tx);
  }) as T;
}

export function vectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? v.toFixed(6) : '0')).join(',')}]`;
}

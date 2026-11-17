/** Implementación en Postgres del puerto de ingesta (resolver credencial, descifrar, encolar). */
import type { QueuedWebhook } from '../../../sdk/ts/envelope.ts';
import { assertUuid, type Sql, withWorkspace } from '../db.ts';
import type { IngestPort, ResolvedCredential } from '../ports.ts';

export class PgIngest implements IngestPort {
  readonly #secrets = new Map<string, { value: Record<string, string>; at: number }>();

  constructor(private readonly sql: Sql, private readonly secretTtlMs = 60_000) {}

  async resolveCredential(credentialId: string): Promise<ResolvedCredential | null> {
    const id = assertUuid(credentialId, 'credential id');
    const rows = await this.sql<
      { workspace_id: string; provider: string; status: string; public_config: Record<string, unknown> }[]
    >`
      select workspace_id, provider, status, public_config from private.telar_resolve_credential(${id}::uuid)`;
    const row = rows[0];
    if (!row) return null;
    return {
      workspaceId: row.workspace_id,
      provider: row.provider as ResolvedCredential['provider'],
      status: row.status as ResolvedCredential['status'],
      publicConfig: row.public_config ?? {},
    };
  }

  /** El secreto se guarda en memoria a lo sumo secretTtlMs: revocar surte efecto en ese plazo. */
  async credentialSecret(workspaceId: string, credentialId: string): Promise<Record<string, string>> {
    const cached = this.#secrets.get(credentialId);
    if (cached && Date.now() - cached.at < this.secretTtlMs) return cached.value;
    const value = await withWorkspace(this.sql, workspaceId, async (tx) => {
      const [row] = await tx<{ secret: Record<string, string> }[]>`
        select private.telar_credential_secret(${assertUuid(credentialId)}::uuid) as secret`;
      return row.secret;
    });
    this.#secrets.set(credentialId, { value, at: Date.now() });
    return value;
  }

  async enqueue(workspaceId: string, message: QueuedWebhook): Promise<number> {
    const [row] = await this.sql<{ id: string }[]>`
      select private.telar_enqueue(${assertUuid(workspaceId)}::uuid, ${this.sql.json(message as never)}) as id`;
    return Number(row.id);
  }

  async markDelivery(provider: 'meta' | 'shopify', deliveryId: string, workspaceId: string): Promise<boolean> {
    const [row] = await this.sql<{ fresh: boolean }[]>`
      select private.telar_mark_delivery(${provider}, ${deliveryId}, ${assertUuid(workspaceId)}::uuid) as fresh`;
    return row.fresh;
  }

  async ping(): Promise<boolean> {
    await this.sql`select 1`;
    return true;
  }
}

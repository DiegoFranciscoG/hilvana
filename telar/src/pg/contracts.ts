/** Almacén de contratos del laboratorio en Postgres (tablas contract, contract_sample, contract_alert). */
import type { ChannelType } from '../../../sdk/ts/envelope.ts';
import type { ContractStore, DriftAlert, StoredContract } from '../../../lab/src/capture.ts';
import type { JsonSchema } from '../../../lab/src/schema.ts';
import type { Tx } from '../db.ts';

type Row = { id: string; channel_type: ChannelType; event_key: string; version: number; schema: JsonSchema; schema_hash: string; sample_count: number };

const toContract = (r: Row): StoredContract => ({
  id: r.id,
  channel: r.channel_type,
  eventKey: r.event_key,
  version: r.version,
  schema: r.schema,
  schemaHash: r.schema_hash,
  sampleCount: r.sample_count,
});

export class PgContractStore implements ContractStore {
  constructor(private readonly tx: Tx, private readonly workspaceId: string) {}

  async current(eventKey: string): Promise<StoredContract | null> {
    const [row] = await this.tx<Row[]>`
      select id, channel_type, event_key, version, schema, schema_hash, sample_count
      from public.contract where event_key = ${eventKey} order by version desc limit 1`;
    return row ? toContract(row) : null;
  }

  async create(input: Omit<StoredContract, 'id' | 'sampleCount'>): Promise<StoredContract> {
    const [row] = await this.tx<Row[]>`
      insert into public.contract (workspace_id, channel_type, event_key, version, schema, schema_hash)
      values (${this.workspaceId}, ${input.channel}, ${input.eventKey}, ${input.version},
              ${this.tx.json(input.schema as never)}, ${input.schemaHash})
      returning id, channel_type, event_key, version, schema, schema_hash, sample_count`;
    return toContract(row);
  }

  async refine(contractId: string, schema: JsonSchema, schemaHash: string): Promise<void> {
    await this.tx`update public.contract set schema = ${this.tx.json(schema as never)}, schema_hash = ${schemaHash}
      where id = ${contractId}`;
  }

  async addSample(contractId: string, payload: unknown, payloadHash: string, maxSamples: number): Promise<boolean> {
    await this.tx`update public.contract set sample_count = sample_count + 1, last_seen_at = now() where id = ${contractId}`;
    const [{ count }] = await this.tx<{ count: number }[]>`
      select count(*)::int as count from public.contract_sample where contract_id = ${contractId}`;
    if (count >= maxSamples) return false;
    const inserted = await this.tx`
      insert into public.contract_sample (workspace_id, contract_id, payload, payload_hash)
      values (${this.workspaceId}, ${contractId}, ${this.tx.json(payload as never)}, ${payloadHash})
      on conflict (contract_id, payload_hash) do nothing returning id`;
    return inserted.length > 0;
  }

  async addAlert(alert: DriftAlert): Promise<void> {
    await this.tx`
      insert into public.contract_alert (workspace_id, contract_id, previous_contract_id, event_key, changes, summary)
      values (${this.workspaceId}, ${alert.contractId}, ${alert.previousContractId}, ${alert.eventKey},
              ${this.tx.json(alert.changes as never)}, ${alert.summary})`;
  }
}

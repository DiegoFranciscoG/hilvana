/**
 * Captura de un webhook propio: anonimiza, infiere la forma, la compara con el contrato vigente
 * y, si cambió, crea una versión nueva con su alerta de deriva (T-08, T-09).
 */
import type { ChannelType } from '../../sdk/ts/envelope.ts';
import { anonymize, findPersonalData, type LabConfig } from './anonymize.ts';
import { canonicalJson, diffSchemas, formatChanges, hashSchema, inferSchema, type JsonSchema, mergeSchemas, type SchemaChange, sha256Hex } from './schema.ts';

export interface StoredContract {
  id: string;
  channel: ChannelType;
  eventKey: string;
  version: number;
  schema: JsonSchema;
  schemaHash: string;
  sampleCount: number;
}

export interface DriftAlert {
  contractId: string;
  previousContractId: string;
  eventKey: string;
  changes: SchemaChange[];
  summary: string;
}

export interface ContractStore {
  current(eventKey: string): Promise<StoredContract | null>;
  create(input: Omit<StoredContract, 'id' | 'sampleCount'>): Promise<StoredContract>;
  /** Reemplaza la forma de la versión vigente durante el aprendizaje inicial (sin alerta). */
  refine(contractId: string, schema: JsonSchema, schemaHash: string): Promise<void>;
  addSample(contractId: string, payload: unknown, payloadHash: string, maxSamples: number): Promise<boolean>;
  addAlert(alert: DriftAlert): Promise<void>;
}

export type CaptureOutcome =
  | { eventKey: string; result: 'created'; contract: StoredContract }
  | { eventKey: string; result: 'unchanged'; contract: StoredContract }
  | { eventKey: string; result: 'learning'; contract: StoredContract }
  | { eventKey: string; result: 'drift'; contract: StoredContract; alert: DriftAlert };

export interface CaptureInput {
  channel: ChannelType;
  eventKeys: string[];
  payload: unknown;
}

export async function captureWebhook(store: ContractStore, config: LabConfig, input: CaptureInput): Promise<CaptureOutcome[]> {
  const sample = anonymize(input.payload, config);
  const serialized = canonicalJson(sample);
  const leaks = findPersonalData(serialized);
  if (leaks.length > 0) {
    // Defensa en profundidad: si un patrón personal sobrevivió, no se guarda nada.
    throw new Error(`anonymization left ${leaks.length} personal data pattern(s); sample discarded`);
  }
  const sampleHash = await sha256Hex(serialized);
  const sampleSchema = inferSchema(sample);
  const keys = input.eventKeys.length > 0 ? [...new Set(input.eventKeys)] : [`${input.channel}.unknown`];
  const outcomes: CaptureOutcome[] = [];

  for (const eventKey of keys) {
    const current = await store.current(eventKey);
    if (!current) {
      const contract = await store.create({
        channel: input.channel,
        eventKey,
        version: 1,
        schema: sampleSchema,
        schemaHash: await hashSchema(sampleSchema),
      });
      await store.addSample(contract.id, sample, sampleHash, config.maxSamplesPerContract);
      outcomes.push({ eventKey, result: 'created', contract });
      continue;
    }

    const merged = mergeSchemas(current.schema, sampleSchema);
    const mergedHash = await hashSchema(merged);
    if (mergedHash === current.schemaHash) {
      await store.addSample(current.id, sample, sampleHash, config.maxSamplesPerContract);
      outcomes.push({ eventKey, result: 'unchanged', contract: current });
      continue;
    }

    if (current.sampleCount < config.learningSamples) {
      await store.refine(current.id, merged, mergedHash);
      await store.addSample(current.id, sample, sampleHash, config.maxSamplesPerContract);
      outcomes.push({ eventKey, result: 'learning', contract: { ...current, schema: merged, schemaHash: mergedHash } });
      continue;
    }

    const changes = diffSchemas(current.schema, merged);
    const contract = await store.create({
      channel: input.channel,
      eventKey,
      version: current.version + 1,
      schema: merged,
      schemaHash: mergedHash,
    });
    await store.addSample(contract.id, sample, sampleHash, config.maxSamplesPerContract);
    const alert: DriftAlert = {
      contractId: contract.id,
      previousContractId: current.id,
      eventKey,
      changes,
      summary: formatChanges(eventKey, changes).slice(0, 2000),
    };
    await store.addAlert(alert);
    outcomes.push({ eventKey, result: 'drift', contract, alert });
  }
  return outcomes;
}

/** Almacén en memoria: pruebas, CLI y reproducción local. */
export class MemoryContractStore implements ContractStore {
  readonly contracts: StoredContract[] = [];
  readonly samples = new Map<string, { hash: string; payload: unknown }[]>();
  readonly alerts: DriftAlert[] = [];

  current(eventKey: string): Promise<StoredContract | null> {
    const versions = this.contracts.filter((c) => c.eventKey === eventKey).sort((a, b) => b.version - a.version);
    return Promise.resolve(versions[0] ?? null);
  }

  create(input: Omit<StoredContract, 'id' | 'sampleCount'>): Promise<StoredContract> {
    const contract: StoredContract = { ...input, id: crypto.randomUUID(), sampleCount: 0 };
    this.contracts.push(contract);
    return Promise.resolve(contract);
  }

  refine(contractId: string, schema: JsonSchema, schemaHash: string): Promise<void> {
    const contract = this.contracts.find((c) => c.id === contractId);
    if (contract) Object.assign(contract, { schema, schemaHash });
    return Promise.resolve();
  }

  addSample(contractId: string, payload: unknown, payloadHash: string, maxSamples: number): Promise<boolean> {
    const list = this.samples.get(contractId) ?? [];
    const contract = this.contracts.find((c) => c.id === contractId);
    if (contract) contract.sampleCount++;
    if (list.some((s) => s.hash === payloadHash) || list.length >= maxSamples) return Promise.resolve(false);
    list.push({ hash: payloadHash, payload });
    this.samples.set(contractId, list);
    return Promise.resolve(true);
  }

  addAlert(alert: DriftAlert): Promise<void> {
    this.alerts.push(alert);
    return Promise.resolve();
  }
}

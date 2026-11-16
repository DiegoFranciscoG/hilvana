/**
 * Almacén en archivos: exporta contratos y muestras al repositorio (lab/contracts, lab/samples)
 * para revisarlos en un pull request y generar tipos.
 */
import { join } from '@std/path';
import type { ContractStore, DriftAlert, StoredContract } from './capture.ts';
import { canonicalJson, type JsonSchema } from './schema.ts';
import { fileStem } from './typegen.ts';

export class FileContractStore implements ContractStore {
  constructor(readonly root: string) {}

  #dir(eventKey: string): string {
    return join(this.root, 'contracts', fileStem(eventKey));
  }

  async #versions(eventKey: string): Promise<StoredContract[]> {
    const out: StoredContract[] = [];
    try {
      for await (const entry of Deno.readDir(this.#dir(eventKey))) {
        if (entry.isFile && /^v\d+\.json$/.test(entry.name)) {
          out.push(JSON.parse(await Deno.readTextFile(join(this.#dir(eventKey), entry.name))));
        }
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    return out.sort((a, b) => b.version - a.version);
  }

  async list(): Promise<StoredContract[]> {
    const out: StoredContract[] = [];
    try {
      for await (const entry of Deno.readDir(join(this.root, 'contracts'))) {
        if (!entry.isDirectory) continue;
        for await (const file of Deno.readDir(join(this.root, 'contracts', entry.name))) {
          if (/^v\d+\.json$/.test(file.name)) {
            out.push(JSON.parse(await Deno.readTextFile(join(this.root, 'contracts', entry.name, file.name))));
          }
        }
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    return out.sort((a, b) => a.eventKey.localeCompare(b.eventKey) || a.version - b.version);
  }

  async current(eventKey: string): Promise<StoredContract | null> {
    return (await this.#versions(eventKey))[0] ?? null;
  }

  async #write(contract: StoredContract): Promise<void> {
    await Deno.mkdir(this.#dir(contract.eventKey), { recursive: true });
    await Deno.writeTextFile(join(this.#dir(contract.eventKey), `v${contract.version}.json`), JSON.stringify(JSON.parse(canonicalJson(contract)), null, 2) + '\n');
  }

  async create(input: Omit<StoredContract, 'id' | 'sampleCount'>): Promise<StoredContract> {
    const contract: StoredContract = { ...input, id: `${fileStem(input.eventKey)}@v${input.version}`, sampleCount: 0 };
    await this.#write(contract);
    return contract;
  }

  async refine(contractId: string, schema: JsonSchema, schemaHash: string): Promise<void> {
    const [stem, version] = contractId.split('@v');
    const path = join(this.root, 'contracts', stem, `v${version}.json`);
    const contract = JSON.parse(await Deno.readTextFile(path)) as StoredContract;
    await this.#write({ ...contract, schema, schemaHash });
  }

  async addSample(contractId: string, payload: unknown, payloadHash: string, maxSamples: number): Promise<boolean> {
    const [stem, version] = contractId.split('@v');
    const contractPath = join(this.root, 'contracts', stem, `v${version}.json`);
    const contract = JSON.parse(await Deno.readTextFile(contractPath)) as StoredContract;
    await this.#write({ ...contract, sampleCount: contract.sampleCount + 1 });
    const dir = join(this.root, 'samples', stem);
    await Deno.mkdir(dir, { recursive: true });
    let count = 0;
    for await (const entry of Deno.readDir(dir)) {
      if (entry.name === `${payloadHash.slice(0, 16)}.json`) return false;
      count++;
    }
    if (count >= maxSamples) return false;
    await Deno.writeTextFile(join(dir, `${payloadHash.slice(0, 16)}.json`), JSON.stringify(payload, null, 2) + '\n');
    return true;
  }

  async addAlert(alert: DriftAlert): Promise<void> {
    const path = join(this.root, 'alerts.jsonl');
    await Deno.writeTextFile(path, JSON.stringify({ ...alert, createdAt: new Date().toISOString() }) + '\n', { append: true });
  }
}

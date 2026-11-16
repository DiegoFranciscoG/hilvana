/** Exporta el JSON Schema de la especificación del agente: deno run --allow-write=agent/schema agent/src/export_schema.ts */
import { specJsonSchema } from './spec.ts';

const target = new URL('../schema/agent-spec.schema.json', import.meta.url);
await Deno.writeTextFile(target, JSON.stringify(specJsonSchema(), null, 2) + '\n');
console.log(`esquema escrito en ${target.pathname}`);

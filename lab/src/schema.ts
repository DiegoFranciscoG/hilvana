/**
 * Inferencia de esquemas JSON (subconjunto de JSON Schema 2020-12) a partir de muestras ya
 * anonimizadas, combinación de esquemas, forma canónica, huella y diferencias legibles (T-09).
 */
import { PLACEHOLDERS } from './anonymize.ts';

export type JsonType = 'string' | 'integer' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export interface JsonSchema {
  type?: JsonType | JsonType[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  format?: string;
  enum?: string[];
  'x-kind'?: string;
}

const KIND_BY_PLACEHOLDER: Record<string, string> = {
  [PLACEHOLDERS.phone]: 'phone',
  [PLACEHOLDERS.name]: 'name',
  [PLACEHOLDERS.email]: 'email',
  [PLACEHOLDERS.text]: 'text',
  [PLACEHOLDERS.id]: 'id',
  [PLACEHOLDERS.url]: 'url',
  [PLACEHOLDERS.numeric]: 'numeric',
};

function typesOf(schema: JsonSchema): JsonType[] {
  if (!schema.type) return [];
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

function withTypes(schema: JsonSchema, types: JsonType[]): JsonSchema {
  const unique = [...new Set(types)].sort();
  // integer ⊂ number: si aparecen ambos, se describe como number.
  const normalized = unique.includes('number') ? unique.filter((t) => t !== 'integer') : unique;
  return { ...schema, type: normalized.length === 1 ? normalized[0] : normalized };
}

export function inferSchema(value: unknown): JsonSchema {
  if (value === null) return { type: 'null' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  if (typeof value === 'string') {
    if (value === PLACEHOLDERS.datetime) return { type: 'string', format: 'date-time' };
    const kind = KIND_BY_PLACEHOLDER[value];
    if (kind) return { type: 'string', 'x-kind': kind };
    if (value === '<key>') return { type: 'string' };
    return { type: 'string', enum: [value] };
  }
  if (Array.isArray(value)) {
    const items = value.map(inferSchema).reduce<JsonSchema | undefined>(
      (acc, s) => acc ? mergeSchemas(acc, s) : s,
      undefined,
    );
    return items ? { type: 'array', items } : { type: 'array' };
  }
  const properties: Record<string, JsonSchema> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) properties[key] = inferSchema(child);
  return { type: 'object', properties, required: Object.keys(properties).sort() };
}

export function mergeSchemas(a: JsonSchema, b: JsonSchema): JsonSchema {
  const merged: JsonSchema = withTypes({}, [...typesOf(a), ...typesOf(b)]);
  const types = typesOf(merged);

  if (types.includes('object') && (a.properties || b.properties)) {
    const properties: Record<string, JsonSchema> = {};
    const keys = new Set([...Object.keys(a.properties ?? {}), ...Object.keys(b.properties ?? {})]);
    for (const key of keys) {
      const left = a.properties?.[key];
      const right = b.properties?.[key];
      properties[key] = left && right ? mergeSchemas(left, right) : (left ?? right)!;
    }
    merged.properties = properties;
    const aObject = typesOf(a).includes('object');
    const bObject = typesOf(b).includes('object');
    const requiredA = new Set(aObject ? a.required ?? [] : []);
    const requiredB = new Set(bObject ? b.required ?? [] : []);
    merged.required = aObject && bObject
      ? [...requiredA].filter((k) => requiredB.has(k)).sort()
      : [...(aObject ? requiredA : requiredB)].sort();
  }
  if (types.includes('array') && (a.items || b.items)) {
    merged.items = a.items && b.items ? mergeSchemas(a.items, b.items) : (a.items ?? b.items);
  }
  if (types.includes('string')) {
    if (a.format && a.format === b.format) merged.format = a.format;
    else if (a.format && !typesOf(b).includes('string')) merged.format = a.format;
    else if (b.format && !typesOf(a).includes('string')) merged.format = b.format;
    const kindA = a['x-kind'];
    const kindB = b['x-kind'];
    if (kindA && (kindA === kindB || !typesOf(b).includes('string'))) merged['x-kind'] = kindA;
    else if (kindB && !typesOf(a).includes('string')) merged['x-kind'] = kindB;
    if ((a.enum || b.enum) && !merged['x-kind'] && !merged.format) {
      const aStringNoEnum = typesOf(a).includes('string') && !a.enum;
      const bStringNoEnum = typesOf(b).includes('string') && !b.enum;
      if (!aStringNoEnum && !bStringNoEnum) merged.enum = [...new Set([...(a.enum ?? []), ...(b.enum ?? [])])].sort();
    }
  }
  return merged;
}

/** JSON con claves ordenadas: la misma forma siempre produce el mismo texto y la misma huella. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hashSchema(schema: JsonSchema): Promise<string> {
  return sha256Hex(canonicalJson(schema));
}

export type ChangeKind =
  | 'added'
  | 'removed'
  | 'type_changed'
  | 'became_optional'
  | 'became_required'
  | 'enum_added'
  | 'kind_changed';

export interface SchemaChange {
  path: string;
  kind: ChangeKind;
  before?: string;
  after?: string;
}

function describe(schema: JsonSchema): string {
  const types = typesOf(schema).join(' | ') || 'any';
  if (schema.format) return `${types} (${schema.format})`;
  if (schema['x-kind']) return `${types} (${schema['x-kind']})`;
  return types;
}

export function diffSchemas(before: JsonSchema, after: JsonSchema, path = ''): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const typesBefore = typesOf(before).join('|');
  const typesAfter = typesOf(after).join('|');
  if (typesBefore !== typesAfter) {
    changes.push({ path: path || '(raíz)', kind: 'type_changed', before: describe(before), after: describe(after) });
  } else if ((before.format ?? before['x-kind']) !== (after.format ?? after['x-kind'])) {
    changes.push({ path: path || '(raíz)', kind: 'kind_changed', before: describe(before), after: describe(after) });
  }
  if (before.enum && after.enum) {
    for (const value of after.enum.filter((v) => !before.enum!.includes(v))) {
      changes.push({ path: path || '(raíz)', kind: 'enum_added', after: value });
    }
  }
  const propsBefore = before.properties ?? {};
  const propsAfter = after.properties ?? {};
  const requiredBefore = new Set(before.required ?? []);
  const requiredAfter = new Set(after.required ?? []);
  for (const key of Object.keys(propsAfter).sort()) {
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in propsBefore)) {
      changes.push({ path: childPath, kind: 'added', after: describe(propsAfter[key]) });
      continue;
    }
    if (requiredBefore.has(key) && !requiredAfter.has(key)) changes.push({ path: childPath, kind: 'became_optional' });
    if (!requiredBefore.has(key) && requiredAfter.has(key)) changes.push({ path: childPath, kind: 'became_required' });
    changes.push(...diffSchemas(propsBefore[key], propsAfter[key], childPath));
  }
  for (const key of Object.keys(propsBefore).sort()) {
    if (!(key in propsAfter)) {
      changes.push({ path: path ? `${path}.${key}` : key, kind: 'removed', before: describe(propsBefore[key]) });
    }
  }
  if (before.items && after.items) changes.push(...diffSchemas(before.items, after.items, `${path}[]`));
  else if (!before.items && after.items) {
    changes.push({ path: `${path}[]`, kind: 'added', after: describe(after.items) });
  }
  return changes;
}

const LABELS: Record<ChangeKind, string> = {
  added: 'campo nuevo',
  removed: 'ya no aparece',
  type_changed: 'cambió el tipo',
  became_optional: 'ahora es opcional',
  became_required: 'ahora es obligatorio',
  enum_added: 'valor nuevo',
  kind_changed: 'cambió el formato',
};

export function formatChanges(eventKey: string, changes: SchemaChange[]): string {
  const sign: Record<ChangeKind, string> = {
    added: '+',
    removed: '-',
    type_changed: '~',
    became_optional: '?',
    became_required: '!',
    enum_added: '+',
    kind_changed: '~',
  };
  const lines = changes.map((c) => {
    const detail = c.before && c.after ? `${c.before} → ${c.after}` : c.after ?? c.before ?? '';
    return `${sign[c.kind]} ${c.path}${detail ? `: ${detail}` : ''} (${LABELS[c.kind]})`;
  });
  return [`Cambio en el contrato ${eventKey}:`, ...lines].join('\n');
}

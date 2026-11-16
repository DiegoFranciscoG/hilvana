/**
 * Generación de tipos TypeScript y Dart desde los esquemas de contrato, para que el código
 * coincida con la forma real de los webhooks. Los archivos generados van al SDK (MIT).
 */
import type { JsonSchema, JsonType } from './schema.ts';

function pascal(text: string): string {
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('') || 'Item';
}

function typesOf(schema: JsonSchema): JsonType[] {
  if (!schema.type) return [];
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

function safeTsKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function tsType(schema: JsonSchema, indent: string): string {
  const parts = typesOf(schema).map((type) => {
    switch (type) {
      case 'string':
        return schema.enum ? schema.enum.map((v) => JSON.stringify(v)).join(' | ') : 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'null':
        return 'null';
      case 'array':
        return schema.items ? `Array<${tsType(schema.items, indent)}>` : 'unknown[]';
      case 'object': {
        const props = schema.properties ?? {};
        const required = new Set(schema.required ?? []);
        const inner = indent + '  ';
        const lines = Object.keys(props).sort().map((key) =>
          `${inner}${safeTsKey(key)}${required.has(key) ? '' : '?'}: ${tsType(props[key], inner)};`
        );
        return lines.length ? `{\n${lines.join('\n')}\n${indent}}` : 'Record<string, unknown>';
      }
    }
  });
  return parts.length ? parts.join(' | ') : 'unknown';
}

export function toTypeScript(eventKey: string, schema: JsonSchema): string {
  const name = pascal(eventKey);
  return [
    '// SPDX-License-Identifier: MIT',
    `// Generado por el laboratorio de contratos de Hilvana desde el contrato ${eventKey}. No editar a mano.`,
    `export type ${name} = ${tsType(schema, '')};`,
    '',
  ].join('\n');
}

interface DartClass {
  name: string;
  fields: { key: string; name: string; type: string; nullable: boolean; parse: string }[];
}

function dartIdentifier(key: string): string {
  const camel = key.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''));
  const safe = /^[0-9]/.test(camel) ? `f${camel}` : camel || 'value';
  const reserved = ['class', 'default', 'enum', 'in', 'is', 'new', 'null', 'switch', 'this', 'var', 'final', 'void', 'object'];
  return reserved.includes(safe) ? `${safe}Field` : safe;
}

function dartFor(schema: JsonSchema, className: string, classes: DartClass[]): { type: string; parse: (expr: string) => string } {
  const types = typesOf(schema).filter((t) => t !== 'null');
  if (types.length !== 1) return { type: 'Object', parse: (e) => e };
  switch (types[0]) {
    case 'string':
      return { type: 'String', parse: (e) => `${e} as String` };
    case 'integer':
      return { type: 'int', parse: (e) => `(${e} as num).toInt()` };
    case 'number':
      return { type: 'double', parse: (e) => `(${e} as num).toDouble()` };
    case 'boolean':
      return { type: 'bool', parse: (e) => `${e} as bool` };
    case 'array': {
      const item = schema.items ? dartFor(schema.items, className + 'Item', classes) : { type: 'Object', parse: (e: string) => e };
      return {
        type: `List<${item.type}>`,
        parse: (e) => `(${e} as List<dynamic>).map((v) => ${item.parse('v')}).toList()`,
      };
    }
    case 'object': {
      collectDartClass(schema, className, classes);
      return { type: className, parse: (e) => `${className}.fromJson(${e} as Map<String, dynamic>)` };
    }
    default:
      return { type: 'Object', parse: (e) => e };
  }
}

function collectDartClass(schema: JsonSchema, name: string, classes: DartClass[]): void {
  if (classes.some((c) => c.name === name)) return;
  const entry: DartClass = { name, fields: [] };
  classes.push(entry);
  const required = new Set(schema.required ?? []);
  for (const key of Object.keys(schema.properties ?? {}).sort()) {
    const child = schema.properties![key];
    const resolved = dartFor(child, name + pascal(key), classes);
    const nullable = !required.has(key) || typesOf(child).includes('null');
    entry.fields.push({ key, name: dartIdentifier(key), type: resolved.type, nullable, parse: resolved.parse(`json['${key}']`) });
  }
}

export function toDart(eventKey: string, schema: JsonSchema): string {
  const classes: DartClass[] = [];
  collectDartClass(schema, pascal(eventKey), classes);
  const body = classes.map((c) => {
    const fields = c.fields.map((f) => `  final ${f.type}${f.nullable ? '?' : ''} ${f.name};`).join('\n');
    const ctor = c.fields.length ? `  const ${c.name}({${c.fields.map((f) => `${f.nullable ? '' : 'required '}this.${f.name}`).join(', ')}});` : `  const ${c.name}();`;
    const parse = c.fields.map((f) =>
      f.nullable
        ? `      ${f.name}: json['${f.key}'] == null ? null : ${f.parse},`
        : `      ${f.name}: ${f.parse},`
    ).join('\n');
    return [
      `class ${c.name} {`,
      fields,
      ctor,
      '',
      `  factory ${c.name}.fromJson(Map<String, dynamic> json) => ${c.name}(`,
      parse,
      '      );',
      '}',
    ].filter((line) => line !== '').join('\n');
  });
  return [
    '// SPDX-License-Identifier: MIT',
    `// Generado por el laboratorio de contratos de Hilvana desde el contrato ${eventKey}. No editar a mano.`,
    '',
    ...body.map((b) => b + '\n'),
  ].join('\n');
}

export function fileStem(eventKey: string): string {
  return eventKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

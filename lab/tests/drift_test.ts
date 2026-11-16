import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { loadLabConfig } from '@hilvana/lab/anonymize.ts';
import { captureWebhook, MemoryContractStore } from '@hilvana/lab/capture.ts';
import { eventKeysOf } from '@hilvana/lab/events.ts';
import { diffSchemas, hashSchema, inferSchema, mergeSchemas } from '@hilvana/lab/schema.ts';
import { fileStem, toDart, toTypeScript } from '@hilvana/lab/typegen.ts';
import { hydrate } from '@hilvana/lab/replay.ts';

const config = { ...(await loadLabConfig()), learningSamples: 1 };
const text = JSON.parse(await Deno.readTextFile(new URL('../fixtures/whatsapp/text.json', import.meta.url)));

function withNewField(payload: typeof text) {
  const copy = structuredClone(payload);
  copy.entry[0].changes[0].value.messages[0].text.preview_url = false;
  return copy;
}

Deno.test('T-09 un campo nuevo genera una alerta de deriva con su diff', async () => {
  const store = new MemoryContractStore();
  const keys = eventKeysOf('whatsapp', text);
  assertEquals(keys, ['whatsapp.messages.text']);

  const [first] = await captureWebhook(store, config, { channel: 'whatsapp', eventKeys: keys, payload: text });
  assertEquals(first.result, 'created');
  const [again] = await captureWebhook(store, config, { channel: 'whatsapp', eventKeys: keys, payload: text });
  assertEquals(again.result, 'unchanged');

  const [drift] = await captureWebhook(store, config, { channel: 'whatsapp', eventKeys: keys, payload: withNewField(text) });
  assertEquals(drift.result, 'drift');
  if (drift.result !== 'drift') return;
  assertEquals(drift.contract.version, 2);
  const added = drift.alert.changes.find((c) => c.kind === 'added');
  assertEquals(added?.path, 'entry[].changes[].value.messages[].text.preview_url');
  assertStringIncludes(drift.alert.summary, '+ entry[].changes[].value.messages[].text.preview_url: boolean (campo nuevo)');
  assertEquals(store.alerts.length, 1);
});

Deno.test('T-09 un cambio de tipo y un campo que desaparece también se reportan', () => {
  const before = inferSchema({ a: 1, b: 'x', c: true });
  const after = mergeSchemas(before, inferSchema({ a: 'texto', b: 'x' }));
  const changes = diffSchemas(before, after);
  assert(changes.some((c) => c.kind === 'type_changed' && c.path === 'a'));
  assert(changes.some((c) => c.kind === 'became_optional' && c.path === 'c'));
});

Deno.test('durante el aprendizaje inicial la forma se afina sin alertas', async () => {
  const store = new MemoryContractStore();
  const learning = { ...config, learningSamples: 5 };
  const keys = ['whatsapp.messages.text'];
  await captureWebhook(store, learning, { channel: 'whatsapp', eventKeys: keys, payload: text });
  const [second] = await captureWebhook(store, learning, { channel: 'whatsapp', eventKeys: keys, payload: withNewField(text) });
  assertEquals(second.result, 'learning');
  assertEquals(store.alerts.length, 0);
  assertEquals(store.contracts.length, 1);
});

Deno.test('la huella del esquema no depende del orden de las claves', async () => {
  assertEquals(await hashSchema(inferSchema({ a: 1, b: { c: '<text>' } })), await hashSchema(inferSchema({ b: { c: '<text>' }, a: 2 })));
});

Deno.test('tipos generados en TypeScript y Dart', async () => {
  const store = new MemoryContractStore();
  const [outcome] = await captureWebhook(store, config, { channel: 'whatsapp', eventKeys: ['whatsapp.messages.text'], payload: text });
  const ts = toTypeScript('whatsapp.messages.text', outcome.contract.schema);
  assertStringIncludes(ts, 'export type WhatsappMessagesText = {');
  assertStringIncludes(ts, 'object: "whatsapp_business_account";');
  const dart = toDart('whatsapp.messages.text', outcome.contract.schema);
  assertStringIncludes(dart, 'class WhatsappMessagesText {');
  assertStringIncludes(dart, 'factory WhatsappMessagesText.fromJson(Map<String, dynamic> json)');
  assertEquals(fileStem('shopify.products/update'), 'shopify_products_update');
});

Deno.test('reproducción: los marcadores se rellenan con datos ficticios válidos para el conector', async () => {
  const store = new MemoryContractStore();
  await captureWebhook(store, config, { channel: 'whatsapp', eventKeys: ['whatsapp.messages.text'], payload: text });
  const [sample] = [...store.samples.values()][0];
  const replayed = hydrate(sample.payload) as typeof text;
  const message = replayed.entry[0].changes[0].value.messages[0];
  assert(/^\d+$/.test(message.from));
  assertEquals(eventKeysOf('whatsapp', replayed), ['whatsapp.messages.text']);
});

import { assert, assertEquals, assertFalse, assertRejects } from '@std/assert';
import { anonymize, findPersonalData, loadLabConfig, PLACEHOLDERS } from '@hilvana/lab/anonymize.ts';
import { captureWebhook, MemoryContractStore } from '@hilvana/lab/capture.ts';
import { canonicalJson } from '@hilvana/lab/schema.ts';

const config = await loadLabConfig();
const fixtureDir = new URL('../fixtures/', import.meta.url);

async function allFixtures(): Promise<{ name: string; payload: unknown }[]> {
  const out: { name: string; payload: unknown }[] = [];
  for (const channel of ['whatsapp', 'messenger', 'instagram', 'shopify']) {
    for await (const entry of Deno.readDir(new URL(`${channel}/`, fixtureDir))) {
      if (entry.name.endsWith('.json')) {
        out.push({
          name: `${channel}/${entry.name}`,
          payload: JSON.parse(await Deno.readTextFile(new URL(`${channel}/${entry.name}`, fixtureDir))),
        });
      }
    }
  }
  return out;
}

// Datos personales sembrados a propósito en los fixtures y en la carga hostil de abajo.
const PERSONAL_VALUES = [
  'Lucía', 'Andrade', 'Mateo', 'Cárdenas', 'Andrés', 'Peña', 'Valeria', 'Mora', 'Sofía', 'Ruiz', 'Rodrigo',
  '593991234567', '593987654321', '0991234567', '998887766', 'lucia.andrade', 'sofia.ruiz', 'valeria.mora',
  'rodrigo.lema', '7000000000000001', '1234500000000001', '6600000000001',
];

const hostile = {
  object: 'whatsapp_business_account',
  type: 'rodrigo.lema@correo.test',
  status: 'Rodrigo Lema',
  notes: ['Llamar al +593 99 765 4321', 'Rodrigo Lema, cédula 0102030405'],
  nested: { deeper: { contacto: 'rodrigo.lema@correo.test', 'rodrigo.lema@correo.test': true } },
  amount: 12.75,
  count: 42,
};

Deno.test('T-08 ninguna muestra anonimizada conserva teléfonos, nombres ni correos', async () => {
  for (const { name, payload } of [...await allFixtures(), { name: 'hostil', payload: hostile }]) {
    const serialized = canonicalJson(anonymize(payload, config));
    assertEquals(findPersonalData(serialized), [], `${name}: patrones personales`);
    for (const value of PERSONAL_VALUES) {
      assertFalse(serialized.includes(value), `${name} conserva "${value}"`);
    }
  }
});

Deno.test('T-08 la forma se conserva: tipos, enumeraciones permitidas y formatos', () => {
  const sample = anonymize(hostile, config) as Record<string, unknown>;
  assertEquals(sample.object, 'whatsapp_business_account');
  assertEquals(sample.type, PLACEHOLDERS.email, 'un valor con @ no pasa aunque el campo sea "type"');
  assertEquals(sample.status, PLACEHOLDERS.text, 'un valor con espacios y mayúsculas no pasa como enumeración');
  assertEquals(sample.amount, 0.5);
  assertEquals(sample.count, 0);
  assert(Object.keys((sample.nested as { deeper: Record<string, unknown> }).deeper).includes('<key>'));
  const iso = anonymize({ updated_at: '2026-11-16T10:00:00-05:00' }, config) as Record<string, string>;
  assertEquals(iso.updated_at, PLACEHOLDERS.datetime);
});

Deno.test('T-08 la captura nunca guarda una muestra con datos personales', async () => {
  const store = new MemoryContractStore();
  const payload = JSON.parse(await Deno.readTextFile(new URL('whatsapp/text.json', fixtureDir)));
  await captureWebhook(store, config, { channel: 'whatsapp', eventKeys: ['whatsapp.messages.text'], payload });
  for (const samples of store.samples.values()) {
    for (const { payload: saved } of samples) {
      const text = JSON.stringify(saved);
      assertEquals(findPersonalData(text), []);
      for (const value of PERSONAL_VALUES) assertFalse(text.includes(value));
    }
  }
});

Deno.test('T-08 defensa en profundidad: si un patrón sobrevive, la muestra se descarta', async () => {
  const leaky = { ...config, keepValueKeys: [...config.keepValueKeys, 'leak'], keepValuePattern: '.*' };
  await assertRejects(
    () => captureWebhook(new MemoryContractStore(), leaky, { channel: 'whatsapp', eventKeys: ['x.y'], payload: { leak: 'rodrigo.lema@correo.test' } }),
    Error,
    'personal data',
  );
});

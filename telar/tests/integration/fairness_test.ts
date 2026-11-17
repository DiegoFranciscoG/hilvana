import { assert, assertEquals } from '@std/assert';
import {
  adminSql,
  buildTelar,
  createWorkspace,
  dropWorkspace,
  postWebhook,
  queueLength,
  whatsappText,
} from './_harness.ts';

const admin = adminSql();
const telar = await buildTelar();

Deno.test({
  name: 'T-10 un espacio saturado no frena a los demás',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Plan "starter": 30 mensajes por minuto por espacio.
    const busy = await createWorkspace(admin, telar.sql, { agent: false });
    const calm = await createWorkspace(admin, telar.sql, { agent: false });
    try {
      for (let i = 0; i < 120; i++) {
        await postWebhook(
          telar.app,
          busy,
          whatsappText(busy, `pedido ${i}`, { from: `59399${String(i).padStart(7, '0')}` }),
        );
      }
      await postWebhook(telar.app, calm, whatsappText(calm, 'hola, ¿abren hoy?'));
      assertEquals(await queueLength(admin, busy), 120);

      const started = performance.now();
      const pending = await telar.drainer.pendingWorkspaces();
      assert(pending.includes(busy.id) && pending.includes(calm.id));
      // Una vuelta del trabajador: el espacio tranquilo se atiende aunque el otro tenga 120 en cola.
      await telar.drainer.drainOnce();
      const [calmMessages] = await admin<{ n: number }[]>`
        select count(*)::int as n from public.message where workspace_id = ${calm.id} and direction = 'inbound'`;
      assertEquals(calmMessages.n, 1, 'el mensaje del espacio tranquilo se procesó en la primera vuelta');
      assert(performance.now() - started < 10_000);

      // Varias vueltas seguidas: el saturado no pasa de su cubeta (30 por minuto más lo que se recarga
      // en el tiempo transcurrido) y el resto espera en su propia cola.
      for (let i = 0; i < 6; i++) await telar.drainer.drainOnce();
      const elapsedSeconds = (performance.now() - started) / 1000;
      const [busyMessages] = await admin<{ n: number }[]>`
        select count(*)::int as n from public.message where workspace_id = ${busy.id} and direction = 'inbound'`;
      const ceiling = 30 + Math.ceil(elapsedSeconds * 0.5) + 1;
      assert(
        busyMessages.n >= 20 && busyMessages.n <= ceiling,
        `procesados del saturado: ${busyMessages.n} (tope ${ceiling})`,
      );
      assertEquals(busyMessages.n + (await queueLength(admin, busy)), 120, 'ningún mensaje se pierde');
    } finally {
      await dropWorkspace(admin, busy);
      await dropWorkspace(admin, calm);
    }
  },
});

Deno.test({
  name: 'aislamiento del rol del Telar: con el espacio A fijado no lee ni descifra B',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const a = await createWorkspace(admin, telar.sql, { agent: false });
    const b = await createWorkspace(admin, telar.sql, { agent: false });
    try {
      await postWebhook(telar.app, b, whatsappText(b, 'mensaje de B'));
      await telar.drainer.drainOnce(b.id);
      const seen = await telar.sql.begin(async (tx) => {
        await tx`select set_config('hilvana.workspace_id', ${a.id}, true)`;
        return await tx<{ n: number }[]>`select count(*)::int as n from public.message`;
      });
      assertEquals(seen[0].n, 0);
      let rejected = false;
      try {
        await telar.sql.begin(async (tx) => {
          await tx`select set_config('hilvana.workspace_id', ${a.id}, true)`;
          await tx`select private.telar_credential_secret(${b.credentialId}::uuid)`;
        });
      } catch {
        rejected = true;
      }
      assert(rejected, 'descifrar la credencial de B con A fijado debe fallar');
    } finally {
      await dropWorkspace(admin, a);
      await dropWorkspace(admin, b);
    }
  },
});

Deno.test({
  name: 'cierre',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await telar.sql.end();
    await admin.end();
  },
});

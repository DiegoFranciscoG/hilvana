import { assert, assertEquals } from '@std/assert';
import { adminSql, buildTelar, createWorkspace, dropWorkspace, postWebhook, queueLength, whatsappText } from './_harness.ts';

const admin = adminSql();
const telar = await buildTelar();

Deno.test({
  name: 'T-01 webhook firmado: 200 en menos de 1 s y queda en la cola; firma inválida: 401 y nada en la cola',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const ws = await createWorkspace(admin, telar.sql);
    try {
      const started = performance.now();
      const ok = await postWebhook(telar.app, ws, whatsappText(ws, '¿Cuánto cuesta la docena de pan de yuca?'));
      const elapsed = performance.now() - started;
      assertEquals(ok.status, 200);
      assert(elapsed < 1000, `respondió en ${elapsed.toFixed(0)} ms`);
      assertEquals(await queueLength(admin, ws), 1);

      const forged = await postWebhook(telar.app, ws, whatsappText(ws, 'hola'), 'secreto-falso');
      assertEquals(forged.status, 401);
      assertEquals(await queueLength(admin, ws), 1);
    } finally {
      await dropWorkspace(admin, ws);
    }
  },
});

Deno.test({
  name: 'T-02 el mismo webhook dos veces produce una sola respuesta (también tras reintento)',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const ws = await createWorkspace(admin, telar.sql);
    try {
      telar.sent.length = 0;
      const payload = whatsappText(ws, '¿Cuánto cuesta la docena de pan de yuca?', { wamid: `wamid.repetido.${ws.slug}` });
      assertEquals((await postWebhook(telar.app, ws, payload)).status, 200);
      assertEquals((await postWebhook(telar.app, ws, payload)).status, 200);
      await telar.drainer.drainOnce(ws.id);
      // Meta reintenta más tarde con el mismo cuerpo (hasta 36 h).
      await postWebhook(telar.app, ws, payload);
      await telar.drainer.drainOnce(ws.id);

      const [counts] = await admin<{ inbound: number; agent: number }[]>`
        select count(*) filter (where direction = 'inbound')::int as inbound,
               count(*) filter (where author = 'agent')::int as agent
        from public.message where workspace_id = ${ws.id}`;
      assertEquals(counts, { inbound: 1, agent: 1 });
      const toCustomer = telar.sent.filter((s) => s.target.externalChannelId === ws.phoneNumberId);
      assertEquals(toCustomer.length, 1, 'una sola respuesta enviada al cliente');
      assert(toCustomer[0].text.includes('$3.50'), toCustomer[0].text);
      assert(toCustomer[0].text.includes('asistente automático'), 'la primera respuesta se identifica como automática');
      assertEquals(await queueLength(admin, ws), 0);
    } finally {
      await dropWorkspace(admin, ws);
    }
  },
});

Deno.test({
  name: 'T-07 fuera de la ventana de 24 h no se envía texto libre (agente ni persona)',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const ws = await createWorkspace(admin, telar.sql);
    try {
      telar.sent.length = 0;
      // Mensaje que llega con 30 horas de atraso (por ejemplo, reintentos de Meta).
      await postWebhook(telar.app, ws, whatsappText(ws, '¿Tienen humitas?', { secondsAgo: 30 * 3600 }));
      await telar.drainer.drainOnce(ws.id);
      const [agent] = await admin<{ status: string }[]>`
        select status from public.message where workspace_id = ${ws.id} and author = 'agent'`;
      assertEquals(agent.status, 'blocked');
      const [handoff] = await admin<{ reason: string }[]>`select reason from public.handoff where workspace_id = ${ws.id}`;
      assertEquals(handoff.reason, 'window_closed');
      assertEquals(telar.sent.length, 0, 'nada salió hacia el cliente');

      const [conversation] = await admin<{ id: string }[]>`select id from public.conversation where workspace_id = ${ws.id}`;
      const human = await telar.app.request(`/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer user:${ws.ownerId}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hola, ¿sigues interesado?' }),
      });
      assertEquals(human.status, 409);
      assertEquals(telar.sent.length, 0);
    } finally {
      await dropWorkspace(admin, ws);
    }
  },
});

Deno.test({
  name: 'el laboratorio guarda la forma del webhook sin datos personales',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const ws = await createWorkspace(admin, telar.sql, { agent: false });
    try {
      await postWebhook(telar.app, ws, whatsappText(ws, 'Soy Rodrigo, mi correo es rodrigo@correo.test', { from: '593987770001' }));
      await telar.drainer.drainOnce(ws.id);
      const [contract] = await admin<{ event_key: string }[]>`select event_key from public.contract where workspace_id = ${ws.id}`;
      assertEquals(contract.event_key, 'whatsapp.messages.text');
      const samples = await admin<{ payload: unknown }[]>`select payload from public.contract_sample where workspace_id = ${ws.id}`;
      const text = JSON.stringify(samples);
      for (const leak of ['Rodrigo', 'rodrigo@correo.test', '593987770001']) assert(!text.includes(leak), `la muestra contiene ${leak}`);
    } finally {
      await dropWorkspace(admin, ws);
    }
  },
});

Deno.test({
  name: 'T-11 eliminar la cuenta borra datos y llama a la API de administración de Auth',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const ws = await createWorkspace(admin, telar.sql, { agent: false });
    const response = await telar.app.request('/api/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer user:${ws.ownerId}` },
    });
    assertEquals(response.status, 200);
    assertEquals((await response.json()).deletedWorkspaces, 1);
    const call = telar.authFetches.at(-1)!;
    assertEquals(call.url, `http://localhost:54321/auth/v1/admin/users/${ws.ownerId}`);
    assertEquals(call.headers.get('apikey'), 'clave-de-prueba-local');
    const [left] = await admin<{ n: number }[]>`select count(*)::int as n from public.workspace where id = ${ws.id}`;
    assertEquals(left.n, 0);
    await admin`delete from auth.users where id = ${ws.ownerId}`;
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

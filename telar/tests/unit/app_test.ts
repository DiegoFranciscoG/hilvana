import { assert, assertEquals, assertFalse } from '@std/assert';
import type { QueuedWebhook } from '@hilvana/sdk/envelope.ts';
import { signMetaBody, signShopifyBody } from '@hilvana/connectors/mod.ts';
import { createApp } from '@hilvana/telar/http/app.ts';
import { createLogger } from '@hilvana/telar/log.ts';
import type { ApiPort, IngestPort } from '@hilvana/telar/ports.ts';
import { loadConfiguratorConfig } from '@hilvana/agent/configurator.ts';

const META_CRED = '11111111-1111-4111-8111-111111111111';
const SHOP_CRED = '22222222-2222-4222-8222-222222222222';
const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const CONVERSATION = '55555555-5555-4555-8555-555555555555';

function harness() {
  const queued: { workspaceId: string; message: QueuedWebhook }[] = [];
  const deliveries = new Set<string>();
  const logs: string[] = [];
  const ingest: IngestPort = {
    resolveCredential: (id) =>
      Promise.resolve(
        id === META_CRED
          ? { workspaceId: WORKSPACE, provider: 'meta', status: 'active', publicConfig: {} }
          : id === SHOP_CRED
          ? { workspaceId: WORKSPACE, provider: 'shopify', status: 'active', publicConfig: { shopDomain: 'demo.myshopify.com' } }
          : null,
      ),
    credentialSecret: (_ws, id) => {
      const meta: Record<string, string> = { appSecret: 'app-secret-de-prueba', accessToken: 'EAAtoken', verifyToken: 'verificar-123' };
      const shopify: Record<string, string> = { clientSecret: 'shopify-secret-de-prueba', accessToken: 'shpat_x' };
      return Promise.resolve(id === META_CRED ? meta : shopify);
    },
    enqueue: (workspaceId, message) => {
      queued.push({ workspaceId, message });
      return Promise.resolve(queued.length);
    },
    markDelivery: (_p, id) => {
      const fresh = !deliveries.has(id);
      deliveries.add(id);
      return Promise.resolve(fresh);
    },
    ping: () => Promise.resolve(true),
  };
  const sent: string[] = [];
  const api: ApiPort = {
    memberRole: (_ws, user) => Promise.resolve(user === USER ? 'agent' : null),
    conversationWorkspace: (id) => Promise.resolve(id === CONVERSATION ? WORKSPACE : null),
    sendHumanReply: ({ text }) => {
      sent.push(text);
      return Promise.resolve(text.includes('tarde') ? { status: 'blocked', reason: 'window_closed' } : { status: 'sent', messageId: 'm1' });
    },
    deleteAccount: () => Promise.resolve({ deletedWorkspaces: 1 }),
    previewAgent: () => Promise.resolve({ action: 'reply', text: 'hola', flags: [] }),
    syncShopifyCatalog: () => Promise.resolve({ upserted: 0 }),
  };
  const app = createApp({
    ingest,
    api,
    verifyUser: (token) => Promise.resolve(token === 'token-valido' ? { userId: USER } : null),
    logger: createLogger('debug', (line) => logs.push(line)),
    allowedOrigins: ['https://app.hilvana.test'],
    maxWebhookBytes: 1024 * 64,
    webhookRatePerMinute: 1000,
  });
  return { app, queued, logs, sent };
}

const fixture = (path: string) => Deno.readTextFile(new URL(`../../../lab/fixtures/${path}`, import.meta.url));

Deno.test('T-01 webhook de Meta con firma válida: 200 en menos de 1 s y queda en la cola', async () => {
  const { app, queued } = harness();
  const body = await fixture('whatsapp/text.json');
  const signature = await signMetaBody(new TextEncoder().encode(body), 'app-secret-de-prueba');
  const started = performance.now();
  const response = await app.request(`/webhooks/meta/${META_CRED}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
    body,
  });
  const elapsed = performance.now() - started;
  assertEquals(response.status, 200);
  assertEquals(await response.text(), 'EVENT_RECEIVED');
  assert(elapsed < 1000, `tardó ${elapsed} ms`);
  assertEquals(queued.length, 1);
  assertEquals(queued[0].workspaceId, WORKSPACE);
  assertEquals(queued[0].message.credentialId, META_CRED);
});

Deno.test('T-01 webhook de Meta con firma inválida: 401 y nada en la cola', async () => {
  const { app, queued, logs } = harness();
  const body = await fixture('whatsapp/text.json');
  const forged = await signMetaBody(new TextEncoder().encode(body), 'otro-secreto');
  const attempts: Record<string, string>[] = [{ 'X-Hub-Signature-256': forged }, {}, { 'X-Hub-Signature-256': 'sha256=00' }];
  for (const headers of attempts) {
    const response = await app.request(`/webhooks/meta/${META_CRED}`, { method: 'POST', headers, body });
    assertEquals(response.status, 401);
  }
  assertEquals(queued.length, 0);
  assert(logs.some((l) => l.includes('webhook_bad_signature')));
  assertFalse(logs.some((l) => l.includes('app-secret-de-prueba')), 'el secreto no aparece en los registros');
});

Deno.test('webhook de Meta: credencial desconocida, cuerpo enorme y JSON inválido', async () => {
  const { app } = harness();
  assertEquals((await app.request('/webhooks/meta/no-es-uuid', { method: 'POST', body: '{}' })).status, 404);
  assertEquals((await app.request(`/webhooks/meta/${crypto.randomUUID()}`, { method: 'POST', body: '{}' })).status, 404);
  const big = 'x'.repeat(70_000);
  assertEquals((await app.request(`/webhooks/meta/${META_CRED}`, { method: 'POST', body: big, headers: { 'Content-Length': String(big.length) } })).status, 413);
  const bad = 'no es json';
  const sig = await signMetaBody(new TextEncoder().encode(bad), 'app-secret-de-prueba');
  assertEquals((await app.request(`/webhooks/meta/${META_CRED}`, { method: 'POST', body: bad, headers: { 'X-Hub-Signature-256': sig } })).status, 400);
});

Deno.test('verificación GET de Meta devuelve el challenge solo con el token del espacio', async () => {
  const { app } = harness();
  const ok = await app.request(`/webhooks/meta/${META_CRED}?hub.mode=subscribe&hub.verify_token=verificar-123&hub.challenge=987654`);
  assertEquals([ok.status, await ok.text()], [200, '987654']);
  const wrong = await app.request(`/webhooks/meta/${META_CRED}?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=987654`);
  assertEquals(wrong.status, 403);
});

Deno.test('webhook de Shopify: HMAC válido encola una vez; repetido o inválido no', async () => {
  const { app, queued } = harness();
  const body = await fixture('shopify/products-update.json');
  const hmac = await signShopifyBody(new TextEncoder().encode(body), 'shopify-secret-de-prueba');
  const headers = {
    'X-Shopify-Hmac-SHA256': hmac,
    'X-Shopify-Topic': 'products/update',
    'X-Shopify-Shop-Domain': 'demo.myshopify.com',
    'X-Shopify-Webhook-Id': 'entrega-1',
  };
  assertEquals((await app.request(`/webhooks/shopify/${SHOP_CRED}`, { method: 'POST', headers, body })).status, 200);
  const repeated = await app.request(`/webhooks/shopify/${SHOP_CRED}`, { method: 'POST', headers, body });
  assertEquals(await repeated.text(), 'DUPLICATE');
  const invalid = await app.request(`/webhooks/shopify/${SHOP_CRED}`, {
    method: 'POST',
    headers: { ...headers, 'X-Shopify-Hmac-SHA256': 'AAAA', 'X-Shopify-Webhook-Id': 'entrega-2' },
    body,
  });
  assertEquals(invalid.status, 401);
  assertEquals(queued.length, 1);
  assertEquals(queued[0].message.meta.topic, 'products/update');
});

Deno.test('API: sin token 401; con rol de agente responde; ventana cerrada 409; CORS solo para orígenes permitidos', async () => {
  const { app, sent } = harness();
  const url = `/api/conversations/${CONVERSATION}/messages`;
  assertEquals((await app.request(url, { method: 'POST', body: JSON.stringify({ text: 'hola' }) })).status, 401);
  const auth = { Authorization: 'Bearer token-valido', 'Content-Type': 'application/json' };
  const ok = await app.request(url, { method: 'POST', headers: auth, body: JSON.stringify({ text: 'Hola, te ayudo' }) });
  assertEquals(ok.status, 202);
  const late = await app.request(url, { method: 'POST', headers: auth, body: JSON.stringify({ text: 'respuesta tarde' }) });
  assertEquals(late.status, 409);
  const other = await app.request(`/api/conversations/${crypto.randomUUID()}/messages`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ text: 'x' }),
  });
  assertEquals(other.status, 403);
  assertEquals(sent, ['Hola, te ayudo', 'respuesta tarde']);

  const preflight = await app.request(url, {
    method: 'OPTIONS',
    headers: { Origin: 'https://app.hilvana.test', 'Access-Control-Request-Method': 'POST' },
  });
  assertEquals(preflight.headers.get('access-control-allow-origin'), 'https://app.hilvana.test');
  const evil = await app.request(url, {
    method: 'OPTIONS',
    headers: { Origin: 'https://malicioso.test', 'Access-Control-Request-Method': 'POST' },
  });
  assertEquals(evil.headers.get('access-control-allow-origin'), null);
});

Deno.test('cabeceras de seguridad, 404 en JSON y errores sin detalles internos', async () => {
  const { app } = harness();
  const health = await app.request('/healthz');
  assertEquals(health.headers.get('x-content-type-options'), 'nosniff');
  assert(health.headers.get('content-security-policy')?.includes("default-src 'none'"));
  assert(health.headers.get('x-request-id'));
  const missing = await app.request('/no-existe');
  assertEquals([missing.status, await missing.json()], [404, { error: 'not_found' }]);
  const openapi = await (await app.request('/openapi.json')).json();
  assertEquals(openapi.openapi, '3.1.0');
});

Deno.test('configurador por API: arranca y avanza sin sesión de servidor', async () => {
  const configurator = await loadConfiguratorConfig();
  const app = createApp({
    ingest: { ping: () => Promise.resolve(true) } as unknown as IngestPort,
    verifyUser: () => Promise.resolve({ userId: USER }),
    logger: createLogger('error', () => {}),
    allowedOrigins: [],
    maxWebhookBytes: 1024,
    configurator,
  });
  const headers = { Authorization: 'Bearer x', 'Content-Type': 'application/json' };
  const first = await (await app.request('/api/configurator/answer', { method: 'POST', headers, body: '{}' })).json();
  assertEquals(first.done, false);
  const second = await (await app.request('/api/configurator/answer', {
    method: 'POST',
    headers,
    body: JSON.stringify({ state: first.state, text: 'Panadería La Espiga' }),
  })).json();
  assertEquals(second.state.step, 1);
  const invalid = await app.request('/api/configurator/answer', { method: 'POST', headers, body: JSON.stringify({ state: { step: 99 }, text: 'x' }) });
  assertEquals(invalid.status, 400);
});

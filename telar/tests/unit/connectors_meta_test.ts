import { assert, assertEquals, assertFalse, assertRejects, assertThrows } from '@std/assert';
import {
  answerVerification,
  buildMessagingBody,
  buildWhatsAppBody,
  GraphClient,
  parseMessagingWebhook,
  parseWhatsAppWebhook,
  sendWhatsApp,
  signMetaBody,
  verifyMetaSignature,
} from '@hilvana/connectors/mod.ts';

const encoder = new TextEncoder();
const fixture = (path: string) => Deno.readTextFile(new URL(`../../../lab/fixtures/${path}`, import.meta.url));

Deno.test('T-01 firma de Meta: válida pasa, alterada o con otro secreto falla', async () => {
  const body = encoder.encode(await fixture('whatsapp/text.json'));
  const header = await signMetaBody(body, 'secreto-de-la-app');
  assert(await verifyMetaSignature(body, header, 'secreto-de-la-app'));

  const tampered = encoder.encode((await fixture('whatsapp/text.json')).replace('pan de yuca', 'pan de queso'));
  assertFalse(await verifyMetaSignature(tampered, header, 'secreto-de-la-app'));
  assertFalse(await verifyMetaSignature(body, header, 'otro-secreto'));
  assertFalse(await verifyMetaSignature(body, header.replace('sha256=', 'sha1='), 'secreto-de-la-app'));
  assertFalse(await verifyMetaSignature(body, null, 'secreto-de-la-app'));
  assertFalse(await verifyMetaSignature(body, 'sha256=zz', 'secreto-de-la-app'));
  assertFalse(await verifyMetaSignature(body, header, ''));
});

Deno.test('verificación GET de Meta: solo devuelve el challenge con el token correcto', () => {
  const params = (token: string, challenge = '1158201444') =>
    new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': challenge });
  assertEquals(answerVerification(params('token-correcto'), 'token-correcto'), '1158201444');
  assertEquals(answerVerification(params('token-falso'), 'token-correcto'), null);
  assertEquals(answerVerification(params('token-correcto', '<script>'), 'token-correcto'), null);
  assertEquals(answerVerification(new URLSearchParams({ 'hub.mode': 'unsubscribe' }), 'x'), null);
});

Deno.test('WhatsApp: texto, imagen y estado se traducen al sobre interno', async () => {
  const [text] = parseWhatsAppWebhook(JSON.parse(await fixture('whatsapp/text.json')));
  assertEquals(text.kind, 'message');
  assertEquals(text.eventKey, 'whatsapp.messages.text');
  assertEquals(text.externalChannelId, '110000000000001');
  assertEquals(text.contact, { externalId: '593991234567', displayName: 'Lucía Andrade' });
  assert(text.message?.text?.includes('pan de yuca'));
  assertEquals(text.occurredAt, new Date(1794830400 * 1000).toISOString());

  const [image] = parseWhatsAppWebhook(JSON.parse(await fixture('whatsapp/image.json')));
  assertEquals(image.message?.kind, 'image');
  assertEquals(image.message?.mediaId, '1234567890123456');

  const [status] = parseWhatsAppWebhook(JSON.parse(await fixture('whatsapp/status-delivered.json')));
  assertEquals(status.kind, 'status');
  assertEquals(status.status?.status, 'delivered');
  assertEquals(status.status?.pricingCategory, 'service');
});

Deno.test('WhatsApp: cargas ajenas o incompletas no producen eventos', () => {
  assertEquals(parseWhatsAppWebhook({ object: 'page', entry: [] }), []);
  assertEquals(parseWhatsAppWebhook(null), []);
  assertEquals(parseWhatsAppWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {} }] }] }), []);
});

Deno.test('Messenger e Instagram: texto entra, eco se ignora', async () => {
  const [messenger] = parseMessagingWebhook(JSON.parse(await fixture('messenger/text.json')));
  assertEquals(messenger.channel, 'messenger');
  assertEquals(messenger.eventKey, 'messenger.message.text');
  assertEquals(messenger.externalChannelId, '200000000000001');

  const [instagram] = parseMessagingWebhook(JSON.parse(await fixture('instagram/text.json')));
  assertEquals(instagram.channel, 'instagram');
  assertEquals(instagram.message?.externalId, 'aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODAw');

  const echo = {
    object: 'page',
    entry: [{ id: '1', messaging: [{ sender: { id: '1' }, timestamp: 1, message: { mid: 'm1', text: 'x', is_echo: true } }] }],
  };
  assertEquals(parseMessagingWebhook(echo), []);
});

Deno.test('cuerpos de envío: WhatsApp texto y plantilla, Messenger con y sin HUMAN_AGENT', () => {
  assertEquals(buildWhatsAppBody('593991234567', { kind: 'text', text: ' Hola ' }), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '593991234567',
    type: 'text',
    text: { preview_url: false, body: 'Hola' },
  });
  const template = buildWhatsAppBody('593991234567', {
    kind: 'template',
    name: 'recordatorio_pedido',
    languageCode: 'es',
    bodyParameters: ['Lunes'],
  });
  assertEquals((template.template as { name: string }).name, 'recordatorio_pedido');
  assertThrows(() => buildWhatsAppBody('+593 99', { kind: 'text', text: 'x' }));
  assertThrows(() => buildWhatsAppBody('593991234567', { kind: 'text', text: '   ' }));

  assertEquals(buildMessagingBody('123', { kind: 'text', text: 'Hola' }).messaging_type, 'RESPONSE');
  const tagged = buildMessagingBody('123', { kind: 'text', text: 'Hola' }, { humanAgentTag: true });
  assertEquals([tagged.messaging_type, tagged.tag], ['MESSAGE_TAG', 'HUMAN_AGENT']);
  assertThrows(() => buildMessagingBody('123', { kind: 'template', name: 'x', languageCode: 'es' }));
});

Deno.test('GraphClient: envía con Bearer y no filtra el token en los errores', async () => {
  const calls: { url: string; auth: string | null }[] = [];
  const ok = new GraphClient({
    baseUrl: 'https://graph.example.test',
    version: 'v27.0',
    accessToken: 'TOKEN-SECRETO-123',
    fetch: (input, init) => {
      calls.push({ url: String(input), auth: new Headers(init?.headers).get('authorization') });
      return Promise.resolve(Response.json({ messages: [{ id: 'wamid.salida' }] }));
    },
  });
  const result = await sendWhatsApp(ok, '110000000000001', '593991234567', { kind: 'text', text: 'Hola' });
  assertEquals(result.externalMessageId, 'wamid.salida');
  assertEquals(calls[0].url, 'https://graph.example.test/v27.0/110000000000001/messages');
  assertEquals(calls[0].auth, 'Bearer TOKEN-SECRETO-123');

  const failing = new GraphClient({
    baseUrl: 'https://graph.example.test',
    version: 'v27.0',
    accessToken: 'TOKEN-SECRETO-123',
    fetch: () => Promise.resolve(Response.json({ error: { code: 131047, message: 'Re-engagement message' } }, { status: 400 })),
  });
  const error = await assertRejects(() => sendWhatsApp(failing, '110000000000001', '593991234567', { kind: 'text', text: 'Hola' }));
  assertFalse(String(error).includes('TOKEN-SECRETO-123'));
  assert(String(error).includes('131047'));
  assertThrows(() => new GraphClient({ baseUrl: 'https://x.test', version: '27', accessToken: 't' }));
});

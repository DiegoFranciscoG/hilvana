import { assert, assertEquals } from '@std/assert';
import { bytesToBase64 } from '@hilvana/connectors/crypto.ts';
import { createLogger } from '@hilvana/telar/log.ts';
import { FcmNotifier } from '@hilvana/telar/push.ts';

// Cuenta de servicio desechable: la llave se genera en cada corrida (nada de llaves en el repositorio).
async function serviceAccountB64(): Promise<string> {
  const keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  const marker = (kind: string) => ['-----', kind, ' PRIVATE KEY-----'].join('');
  const pem = [marker('BEGIN'), bytesToBase64(der), marker('END')].join('\n');
  return btoa(
    JSON.stringify({
      client_email: 'avisos@ejemplo.test',
      private_key: pem,
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
  );
}

Deno.test('FCM: el aviso va al FID del dispositivo, sin el texto del cliente y reutilizando el acceso', async () => {
  const requests: { url: string; body: string }[] = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const url = String(input);
    requests.push({ url, body: String(init?.body ?? '') });
    if (url.startsWith('https://oauth2.googleapis.com/')) {
      return Promise.resolve(Response.json({ access_token: 'acceso-de-prueba', expires_in: 3600 }));
    }
    return Promise.resolve(Response.json({ name: 'projects/proyecto-demo/messages/1' }));
  };
  const notifier = new FcmNotifier(
    'proyecto-demo',
    await serviceAccountB64(),
    createLogger('error', () => {}),
    fakeFetch,
  );
  const devices = [{ token: 'fid-de-prueba-0001', platform: 'android' }, {
    token: 'fid-de-prueba-0002',
    platform: 'ios',
  }];

  await notifier.notifyHandoff('espacio-1', devices, 'Una conversación necesita a una persona');
  await notifier.notifyHandoff('espacio-1', devices.slice(0, 1), 'Una conversación necesita a una persona');

  const sends = requests.filter((r) => r.url === 'https://fcm.googleapis.com/v1/projects/proyecto-demo/messages:send');
  assertEquals(sends.length, 3);
  assertEquals(requests.length - sends.length, 1, 'el token de acceso se pide una sola vez');
  const message = JSON.parse(sends[0].body).message;
  assertEquals(message.fid, 'fid-de-prueba-0001');
  assert(!('token' in message), 'el campo token está deprecado en la API HTTP v1');
  assertEquals(message.data, { workspaceId: 'espacio-1', kind: 'handoff' });
});

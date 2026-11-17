/**
 * Avisos push con Firebase Cloud Messaging (API HTTP v1) cuando una conversación pasa a una persona.
 * Cada dispositivo se identifica por su ID de instalación de Firebase (campo `fid`; `token` está
 * deprecado). La cuenta de servicio llega por entorno (FCM_SERVICE_ACCOUNT_B64) y nunca se registra.
 * El aviso no incluye el contenido del mensaje del cliente (minimización: no se muestra en la
 * pantalla bloqueada).
 */
import { bytesToBase64 } from '../connectors/crypto.ts';
import type { Logger } from './log.ts';
import type { Notifier } from './worker/reply.ts';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function b64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return bytesToBase64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

export class FcmNotifier implements Notifier {
  #token: { value: string; expiresAt: number } | null = null;
  readonly #account: ServiceAccount;

  constructor(
    private readonly projectId: string,
    serviceAccountB64: string,
    private readonly logger: Logger,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.#account = JSON.parse(atob(serviceAccountB64));
    if (!this.#account.client_email || !this.#account.private_key || !this.#account.token_uri?.startsWith('https://')) {
      throw new Error('invalid FCM service account');
    }
  }

  async #accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.#token && this.#token.expiresAt - 60 > now) return this.#token.value;
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
      iss: this.#account.client_email,
      scope: SCOPE,
      aud: this.#account.token_uri,
      iat: now,
      exp: now + 3600,
    }));
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToDer(this.#account.private_key) as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)),
    );
    const response = await this.fetchFn(this.#account.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${b64url(signature)}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`FCM token ${response.status}`);
    const body = await response.json() as { access_token: string; expires_in: number };
    this.#token = { value: body.access_token, expiresAt: now + body.expires_in };
    return body.access_token;
  }

  async notifyHandoff(workspaceId: string, tokens: { token: string; platform: string }[], text: string): Promise<void> {
    const accessToken = await this.#accessToken();
    for (const { token } of tokens.slice(0, 50)) {
      const response = await this.fetchFn(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            fid: token,
            notification: { title: 'Hilvana', body: text },
            data: { workspaceId, kind: 'handoff' },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      if (!response.ok) this.logger.warn('push_rejected', { workspaceId, status: response.status });
    }
  }
}

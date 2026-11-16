// SPDX-License-Identifier: MIT
/**
 * Webhooks de Meta (WhatsApp, Messenger, Instagram).
 * - GET de verificación: hub.mode=subscribe, hub.verify_token, hub.challenge (docs/investigacion.md #21).
 * - POST firmado: X-Hub-Signature-256: sha256=<hex> = HMAC-SHA256(App Secret, cuerpo crudo) (#21, #28).
 *   La firma se calcula sobre los bytes tal como llegan; nunca sobre el JSON re-serializado.
 */
import { hexToBytes, hmacSha256, timingSafeEqual, timingSafeEqualText } from '../crypto.ts';

const SIGNATURE_PREFIX = 'sha256=';

export async function verifyMetaSignature(
  rawBody: Uint8Array,
  header: string | null | undefined,
  appSecret: string,
): Promise<boolean> {
  if (!header || !header.startsWith(SIGNATURE_PREFIX) || appSecret.length === 0) return false;
  const received = hexToBytes(header.slice(SIGNATURE_PREFIX.length));
  if (!received || received.length !== 32) return false;
  const expected = await hmacSha256(appSecret, rawBody);
  return timingSafeEqual(expected, received);
}

/** Firma un cuerpo como lo haría Meta (para pruebas y para reproducir contratos en local). */
export async function signMetaBody(rawBody: Uint8Array, appSecret: string): Promise<string> {
  const digest = await hmacSha256(appSecret, rawBody);
  return SIGNATURE_PREFIX + Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Responde la verificación del webhook. Devuelve el challenge a repetir o null si la
 * solicitud no es válida. Solo se repiten caracteres seguros (sin HTML ni espacios).
 */
export function answerVerification(params: URLSearchParams, verifyToken: string): string | null {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (mode !== 'subscribe' || !token || !challenge || verifyToken.length === 0) return null;
  if (!timingSafeEqualText(token, verifyToken)) return null;
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(challenge)) return null;
  return challenge;
}

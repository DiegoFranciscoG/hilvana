// SPDX-License-Identifier: MIT
/**
 * Messenger e Instagram comparten la forma entry[].messaging[] (#28, #30; S-03 para Instagram).
 * Envío: Messenger por graph.facebook.com/{page-id}/messages; Instagram por
 * graph.instagram.com/{ig-id}/messages. La etiqueta HUMAN_AGENT solo la usan personas (#27, #29).
 */
import type { InboundEvent, MessageKind, OutboundContent, SendResult } from '../../../sdk/ts/envelope.ts';
import type { GraphClient } from './graph.ts';

type Json = Record<string, unknown>;
export type MessagingChannel = 'messenger' | 'instagram';

const ATTACHMENT_KINDS: Record<string, MessageKind> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'document',
  location: 'location',
  sticker: 'sticker',
};

function obj(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : undefined;
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : typeof value === 'number' ? String(value) : undefined;
}
function msToIso(value: unknown): string {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString();
}

export function messagingChannelOf(payload: unknown): MessagingChannel | null {
  const object = obj(payload)?.object;
  if (object === 'page') return 'messenger';
  if (object === 'instagram') return 'instagram';
  return null;
}

export function parseMessagingWebhook(payload: unknown): InboundEvent[] {
  const channel = messagingChannelOf(payload);
  if (!channel) return [];
  const events: InboundEvent[] = [];

  for (const rawEntry of arr(obj(payload)?.entry)) {
    const entry = obj(rawEntry);
    const accountId = str(entry?.id);
    if (!entry || !accountId) continue;

    for (const rawEvent of arr(entry.messaging)) {
      const event = obj(rawEvent);
      const senderId = str(obj(event?.sender)?.id);
      if (!event || !senderId) continue;
      const occurredAt = msToIso(event.timestamp);
      const message = obj(event.message);

      if (message) {
        // Los "eco" son mensajes que envió la propia página: no son del cliente.
        if (message.is_echo === true) continue;
        const mid = str(message.mid);
        if (!mid) continue;
        const attachment = obj(arr(message.attachments)[0]);
        const attachmentType = str(attachment?.type);
        const kind: MessageKind = str(message.text)
          ? 'text'
          : attachmentType
          ? (ATTACHMENT_KINDS[attachmentType] ?? 'unsupported')
          : 'unsupported';
        events.push({
          v: 1,
          channel,
          kind: 'message',
          eventKey: `${channel}.message.${attachmentType && !str(message.text) ? `attachment_${attachmentType}` : kind}`,
          externalChannelId: accountId,
          occurredAt,
          contact: { externalId: senderId },
          message: {
            externalId: mid,
            kind,
            text: str(message.text) ?? str(obj(message.quick_reply)?.payload),
            replyTo: str(obj(message.reply_to)?.mid),
          },
        });
        continue;
      }

      const postback = obj(event.postback);
      if (postback) {
        const mid = str(postback.mid) ?? `postback-${senderId}-${str(event.timestamp) ?? Date.now()}`;
        events.push({
          v: 1,
          channel,
          kind: 'message',
          eventKey: `${channel}.postback`,
          externalChannelId: accountId,
          occurredAt,
          contact: { externalId: senderId },
          message: { externalId: mid, kind: 'interactive', text: str(postback.title) },
        });
        continue;
      }

      const known = ['read', 'delivery', 'reaction', 'referral', 'optin'].find((key) => key in event);
      events.push({
        v: 1,
        channel,
        kind: 'unknown',
        eventKey: `${channel}.${known ?? 'other'}`,
        externalChannelId: accountId,
        occurredAt,
        contact: { externalId: senderId },
      });
    }
  }
  return events;
}

export interface MessagingSendOptions {
  /** HUMAN_AGENT: respuesta de una persona fuera de las 24 h y dentro de 7 días. */
  humanAgentTag?: boolean;
}

export function buildMessagingBody(
  recipientId: string,
  content: OutboundContent,
  options: MessagingSendOptions = {},
): Record<string, unknown> {
  if (!/^\d{1,64}$/.test(recipientId)) throw new Error('invalid recipient id');
  if (content.kind !== 'text') throw new Error('templates are WhatsApp-only');
  const text = content.text.trim();
  if (text.length === 0 || new TextEncoder().encode(text).length > 1000) throw new Error('invalid text length');
  return {
    recipient: { id: recipientId },
    message: { text },
    ...(options.humanAgentTag ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' } : { messaging_type: 'RESPONSE' }),
  };
}

export async function sendMessaging(
  client: GraphClient,
  accountId: string,
  recipientId: string,
  content: OutboundContent,
  options: MessagingSendOptions = {},
): Promise<SendResult> {
  if (!/^\d{1,64}$/.test(accountId)) throw new Error('invalid account id');
  const response = await client.post<{ message_id?: string }>(
    `${accountId}/messages`,
    buildMessagingBody(recipientId, content, options),
  );
  if (!response.message_id) throw new Error('Meta did not return a message id');
  return { externalMessageId: response.message_id };
}

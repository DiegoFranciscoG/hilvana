// SPDX-License-Identifier: MIT
/**
 * Traduce el webhook de WhatsApp Cloud API al sobre interno.
 * Forma documentada: object=whatsapp_business_account, entry[].changes[].value con
 * metadata.phone_number_id, contacts[], messages[] y statuses[] (#21, #22; S-03).
 */
import type { InboundEvent, MessageKind } from '../../../sdk/ts/envelope.ts';

type Json = Record<string, unknown>;

const MEDIA_KINDS: Record<string, MessageKind> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
  sticker: 'sticker',
};

function obj(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : undefined;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function unixToIso(value: unknown): string {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

function keyPart(value: string | undefined): string {
  return (value ?? 'unknown').toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'unknown';
}

export function isWhatsAppPayload(payload: unknown): boolean {
  return obj(payload)?.object === 'whatsapp_business_account';
}

export function parseWhatsAppWebhook(payload: unknown): InboundEvent[] {
  const root = obj(payload);
  if (!root || root.object !== 'whatsapp_business_account') return [];
  const events: InboundEvent[] = [];

  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const field = str(obj(change)?.field) ?? 'unknown';
      const value = obj(obj(change)?.value);
      const phoneNumberId = str(obj(value?.metadata)?.phone_number_id);
      if (!value || !phoneNumberId) continue;

      if (field !== 'messages') {
        events.push({
          v: 1,
          channel: 'whatsapp',
          kind: 'unknown',
          eventKey: `whatsapp.${keyPart(field)}`,
          externalChannelId: phoneNumberId,
          occurredAt: new Date().toISOString(),
        });
        continue;
      }

      const names = new Map<string, string>();
      for (const contact of arr(value.contacts)) {
        const waId = str(obj(contact)?.wa_id);
        const name = str(obj(obj(contact)?.profile)?.name);
        if (waId && name) names.set(waId, name);
      }

      for (const raw of arr(value.messages)) {
        const message = obj(raw);
        const from = str(message?.from);
        const id = str(message?.id);
        if (!message || !from || !id) continue;
        const type = str(message.type) ?? 'unsupported';
        let kind: MessageKind = 'unsupported';
        let text: string | undefined;
        let mediaId: string | undefined;

        if (type === 'text') {
          kind = 'text';
          text = str(obj(message.text)?.body);
        } else if (type in MEDIA_KINDS) {
          kind = MEDIA_KINDS[type];
          const media = obj(message[type]);
          mediaId = str(media?.id);
          text = str(media?.caption);
        } else if (type === 'location') {
          kind = 'location';
        } else if (type === 'reaction') {
          kind = 'reaction';
          text = str(obj(message.reaction)?.emoji);
        } else if (type === 'interactive') {
          kind = 'interactive';
          const interactive = obj(message.interactive);
          text = str(obj(interactive?.button_reply)?.title) ?? str(obj(interactive?.list_reply)?.title);
        } else if (type === 'button') {
          kind = 'interactive';
          text = str(obj(message.button)?.text);
        }

        events.push({
          v: 1,
          channel: 'whatsapp',
          kind: 'message',
          eventKey: `whatsapp.messages.${keyPart(type)}`,
          externalChannelId: phoneNumberId,
          occurredAt: unixToIso(message.timestamp),
          contact: { externalId: from, displayName: names.get(from) },
          message: { externalId: id, kind, text, mediaId, replyTo: str(obj(message.context)?.id) },
        });
      }

      for (const raw of arr(value.statuses)) {
        const status = obj(raw);
        const id = str(status?.id);
        const state = str(status?.status);
        if (!status || !id || !state) continue;
        const firstError = obj(arr(status.errors)[0]);
        const pricing = obj(status.pricing);
        events.push({
          v: 1,
          channel: 'whatsapp',
          kind: 'status',
          eventKey: `whatsapp.statuses.${keyPart(state)}`,
          externalChannelId: phoneNumberId,
          occurredAt: unixToIso(status.timestamp),
          contact: str(status.recipient_id) ? { externalId: str(status.recipient_id)! } : undefined,
          status: {
            externalMessageId: id,
            status: (['sent', 'delivered', 'read', 'failed'].includes(state) ? state : 'failed') as
              | 'sent'
              | 'delivered'
              | 'read'
              | 'failed',
            error: firstError
              ? { code: Number(firstError.code ?? 0), title: String(firstError.title ?? 'error').slice(0, 200) }
              : undefined,
            pricingCategory: str(pricing?.category),
            billable: typeof pricing?.billable === 'boolean' ? pricing.billable : undefined,
          },
        });
      }
    }
  }
  return events;
}

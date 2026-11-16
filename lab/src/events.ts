/** Claves de evento de un webhook, usando los mismos conectores que el Telar. */
import type { ChannelType } from '../../sdk/ts/envelope.ts';
import { isWhatsAppPayload, parseWhatsAppWebhook } from '../../telar/connectors/whatsapp/parse.ts';
import { messagingChannelOf, parseMessagingWebhook } from '../../telar/connectors/meta/messaging.ts';

export function detectMetaChannel(payload: unknown): ChannelType | null {
  if (isWhatsAppPayload(payload)) return 'whatsapp';
  return messagingChannelOf(payload);
}

export function eventKeysOf(channel: ChannelType, payload: unknown, shopifyTopic?: string): string[] {
  if (channel === 'shopify') {
    return [`shopify.${(shopifyTopic ?? 'unknown').toLowerCase().replace(/[^a-z0-9_/]/g, '_')}`];
  }
  const events = channel === 'whatsapp' ? parseWhatsAppWebhook(payload) : parseMessagingWebhook(payload);
  return [...new Set(events.map((e) => e.eventKey))];
}

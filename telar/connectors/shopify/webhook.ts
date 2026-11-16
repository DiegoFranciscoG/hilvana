// SPDX-License-Identifier: MIT
/**
 * Webhooks de Shopify.
 * - X-Shopify-Hmac-SHA256 = base64(HMAC-SHA256(client secret, cuerpo crudo)), comparación en tiempo
 *   constante (#32). Los webhooks de cumplimiento responden 401 si el HMAC no es válido (#33).
 * - Deduplicación con X-Shopify-Webhook-Id (#32).
 */
import type { InboundEvent } from '../../../sdk/ts/envelope.ts';
import { base64ToBytes, bytesToBase64, hmacSha256, timingSafeEqual } from '../crypto.ts';

type Json = Record<string, unknown>;

export const COMPLIANCE_TOPICS = ['customers/data_request', 'customers/redact', 'shop/redact'] as const;

export async function verifyShopifyHmac(
  rawBody: Uint8Array,
  header: string | null | undefined,
  clientSecret: string,
): Promise<boolean> {
  if (!header || clientSecret.length === 0) return false;
  const received = base64ToBytes(header.trim());
  if (!received || received.length !== 32) return false;
  const expected = await hmacSha256(clientSecret, rawBody);
  return timingSafeEqual(expected, received);
}

export async function signShopifyBody(rawBody: Uint8Array, clientSecret: string): Promise<string> {
  return bytesToBase64(await hmacSha256(clientSecret, rawBody));
}

function obj(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : undefined;
}
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : typeof value === 'number' ? String(value) : undefined;
}

/** Quita etiquetas HTML de descripciones de producto (texto plano para el agente). */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

export function parseShopifyWebhook(
  topic: string,
  shopDomain: string,
  payload: unknown,
  shopCurrency: string,
): InboundEvent[] {
  const body = obj(payload);
  const now = new Date().toISOString();
  const eventKey = `shopify.${topic.toLowerCase().replace(/[^a-z0-9_/]/g, '_')}`;
  if (!body) return [];

  if (topic === 'products/create' || topic === 'products/update') {
    const productTitle = str(body.title) ?? 'Producto';
    const description = stripHtml(str(body.body_html) ?? '').slice(0, 3000);
    const status = str(body.status);
    const variants = Array.isArray(body.variants) ? body.variants : [];
    return variants.map((raw) => {
      const variant = obj(raw) ?? {};
      const variantTitle = str(variant.title);
      const price = Number(variant.price);
      const stock = Number(variant.inventory_quantity);
      return {
        v: 1 as const,
        channel: 'shopify' as const,
        kind: 'catalog' as const,
        eventKey,
        externalChannelId: shopDomain,
        occurredAt: str(body.updated_at) ?? now,
        catalog: {
          action: status === 'active' || status === undefined ? 'upsert' as const : 'delete' as const,
          externalRef: `shopify:variant:${str(variant.id) ?? 'unknown'}`,
          title: variantTitle && variantTitle !== 'Default Title' ? `${productTitle} – ${variantTitle}` : productTitle,
          description: description || productTitle,
          price: Number.isFinite(price) ? price : undefined,
          currency: Number.isFinite(price) ? shopCurrency : undefined,
          stock: Number.isFinite(stock) && stock >= 0 ? stock : undefined,
        },
      };
    });
  }

  if (topic === 'products/delete') {
    return [{
      v: 1,
      channel: 'shopify',
      kind: 'catalog',
      eventKey,
      externalChannelId: shopDomain,
      occurredAt: now,
      catalog: { action: 'delete', externalRef: `shopify:product:${str(body.id) ?? 'unknown'}` },
    }];
  }

  if ((COMPLIANCE_TOPICS as readonly string[]).includes(topic)) {
    const customer = obj(body.customer);
    return [{
      v: 1,
      channel: 'shopify',
      kind: 'compliance',
      eventKey,
      externalChannelId: str(body.shop_domain) ?? shopDomain,
      occurredAt: now,
      compliance: {
        topic: topic as typeof COMPLIANCE_TOPICS[number],
        customerExternalIds: [str(customer?.id), str(customer?.email), str(customer?.phone)].filter(
          (value): value is string => Boolean(value),
        ),
      },
    }];
  }

  return [{ v: 1, channel: 'shopify', kind: 'unknown', eventKey, externalChannelId: shopDomain, occurredAt: now }];
}

/**
 * Reproducción local: las muestras anónimas se rellenan con datos ficticios deterministas,
 * se firman con el secreto de una app de prueba y se envían al Telar local, sin depender de Meta.
 */
import { signMetaBody } from '../../telar/connectors/meta/signature.ts';
import { signShopifyBody } from '../../telar/connectors/shopify/webhook.ts';
import { PLACEHOLDERS } from './anonymize.ts';

/** Reemplaza marcadores por valores ficticios estables (mismo índice → mismo valor). */
export function hydrate(sample: unknown, seed = 1): unknown {
  let counter = seed;
  const next = () => counter++;
  const fake: Record<string, () => string> = {
    [PLACEHOLDERS.phone]: () => `5939900${String(next()).padStart(5, '0')}`,
    [PLACEHOLDERS.name]: () => `Cliente de prueba ${next()}`,
    [PLACEHOLDERS.email]: () => `cliente${next()}@correo.test`,
    [PLACEHOLDERS.text]: () => `Mensaje de prueba ${next()}`,
    [PLACEHOLDERS.id]: () => `${100000000000000 + next()}`,
    [PLACEHOLDERS.url]: () => `https://ejemplo.test/recurso/${next()}`,
    [PLACEHOLDERS.numeric]: () => `${Math.floor(Date.now() / 1000)}`,
  };
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      if (node === PLACEHOLDERS.datetime) return new Date().toISOString();
      return fake[node]?.() ?? node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  };
  return walk(sample);
}

export interface ReplayTarget {
  url: string;
  provider: 'meta' | 'shopify';
  secret: string;
  shopifyTopic?: string;
  shopDomain?: string;
  fetch?: typeof fetch;
}

export async function replaySample(target: ReplayTarget, payload: unknown): Promise<number> {
  const parsed = new URL(target.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('replay only targets a local Telar');
  }
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (target.provider === 'meta') {
    headers['X-Hub-Signature-256'] = await signMetaBody(body, target.secret);
  } else {
    headers['X-Shopify-Hmac-SHA256'] = await signShopifyBody(body, target.secret);
    headers['X-Shopify-Topic'] = target.shopifyTopic ?? 'products/update';
    headers['X-Shopify-Shop-Domain'] = target.shopDomain ?? 'demo.myshopify.com';
    headers['X-Shopify-Webhook-Id'] = crypto.randomUUID();
  }
  const response = await (target.fetch ?? fetch)(target.url, { method: 'POST', headers, body });
  await response.body?.cancel();
  return response.status;
}

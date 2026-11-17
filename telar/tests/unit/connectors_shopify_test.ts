import { assert, assertEquals, assertFalse, assertRejects, assertThrows } from '@std/assert';
import {
  parseShopifyWebhook,
  ShopifyAdmin,
  signShopifyBody,
  stripHtml,
  verifyShopifyHmac,
} from '@hilvana/connectors/mod.ts';

const encoder = new TextEncoder();
const fixture = (path: string) => Deno.readTextFile(new URL(`../../../lab/fixtures/${path}`, import.meta.url));

Deno.test('Shopify HMAC base64: válido pasa, alterado falla', async () => {
  const body = encoder.encode(await fixture('shopify/products-update.json'));
  const header = await signShopifyBody(body, 'client-secret-de-prueba');
  assert(await verifyShopifyHmac(body, header, 'client-secret-de-prueba'));
  assertFalse(await verifyShopifyHmac(body, header, 'otro'));
  assertFalse(await verifyShopifyHmac(encoder.encode('{}'), header, 'client-secret-de-prueba'));
  assertFalse(await verifyShopifyHmac(body, 'no-es-base64!', 'client-secret-de-prueba'));
  assertFalse(await verifyShopifyHmac(body, undefined, 'client-secret-de-prueba'));
});

Deno.test('Shopify products/update: cada variante es un ítem de catálogo con precio y stock', async () => {
  const events = parseShopifyWebhook(
    'products/update',
    'panaderia-andina-demo.myshopify.com',
    JSON.parse(await fixture('shopify/products-update.json')),
    'USD',
  );
  assertEquals(events.length, 2);
  assertEquals(events[0].catalog, {
    action: 'upsert',
    externalRef: 'shopify:variant:4400000000001',
    title: 'Pan de yuca – Docena',
    description: 'Docena de pan de yuca recién horneado.',
    price: 3.5,
    currency: 'USD',
    stock: 40,
  });
});

Deno.test('Shopify cumplimiento: customers/redact identifica al cliente', async () => {
  const [event] = parseShopifyWebhook(
    'customers/redact',
    'panaderia-andina-demo.myshopify.com',
    JSON.parse(await fixture('shopify/customers-redact.json')),
    'USD',
  );
  assertEquals(event.kind, 'compliance');
  assertEquals(event.compliance?.topic, 'customers/redact');
  assert(event.compliance?.customerExternalIds.includes('6600000000001'));
});

Deno.test('stripHtml deja texto plano', () => {
  assertEquals(stripHtml('<p>Hola&nbsp;<b>mundo</b> &amp; más</p>'), 'Hola mundo & más');
});

Deno.test('ShopifyAdmin: pagina el catálogo, usa la cabecera de token y espera si la cubeta está baja', async () => {
  const waits: number[] = [];
  let call = 0;
  const admin = new ShopifyAdmin({
    shopDomain: 'panaderia-andina-demo.myshopify.com',
    apiVersion: '2026-10',
    accessToken: 'shpat_prueba',
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    fetch: (_input, init) => {
      assertEquals(new Headers(init?.headers).get('x-shopify-access-token'), 'shpat_prueba');
      call++;
      const page = call === 1
        ? {
          hasNextPage: true,
          endCursor: 'c1',
          title: 'Pan de yuca',
          variant: { title: 'Docena', price: '3.50', qty: 40 },
        }
        : {
          hasNextPage: false,
          endCursor: null,
          title: 'Empanada',
          variant: { title: 'Default Title', price: '1.25', qty: null },
        };
      return Promise.resolve(Response.json({
        data: {
          shop: { currencyCode: 'USD' },
          products: {
            pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
            nodes: [{
              id: `gid://shopify/Product/${call}`,
              title: page.title,
              description: '',
              variants: {
                nodes: [{
                  id: `gid://shopify/ProductVariant/${call}0`,
                  title: page.variant.title,
                  sku: null,
                  price: page.variant.price,
                  inventoryQuantity: page.variant.qty,
                }],
              },
            }],
          },
        },
        extensions: {
          cost: {
            requestedQueryCost: 52,
            throttleStatus: { currentlyAvailable: call === 1 ? 2 : 900, restoreRate: 100 },
          },
        },
      }));
    },
  });
  const catalog = await admin.fetchCatalog();
  assertEquals(catalog.map((item) => item.title), ['Pan de yuca – Docena', 'Empanada']);
  assertEquals(catalog[1].stock, undefined);
  assertEquals(waits, [500]);
  assertThrows(() => new ShopifyAdmin({ shopDomain: 'evil.com', apiVersion: '2026-10', accessToken: 'x' }));
  const broken = new ShopifyAdmin({
    shopDomain: 'a-b.myshopify.com',
    apiVersion: '2026-10',
    accessToken: 'x',
    fetch: () => Promise.resolve(Response.json({ errors: [{ message: 'Access denied' }] })),
  });
  await assertRejects(() => broken.fetchCatalog(), Error, 'Access denied');
});

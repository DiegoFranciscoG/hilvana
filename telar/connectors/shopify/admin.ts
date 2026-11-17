// SPDX-License-Identifier: MIT
/**
 * Cliente de Shopify Admin GraphQL (#31, #35, #36): POST
 * https://{tienda}.myshopify.com/admin/api/{versión}/graphql.json con X-Shopify-Access-Token.
 * Respeta el límite por costo: si la cubeta queda baja, espera lo que indica throttleStatus.
 */

export interface ShopifyAdminOptions {
  shopDomain: string;
  apiVersion: string;
  accessToken: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export interface CatalogVariant {
  externalRef: string;
  title: string;
  description: string;
  price: number | undefined;
  currency: string;
  stock: number | undefined;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
  extensions?: {
    cost?: { requestedQueryCost?: number; throttleStatus?: { currentlyAvailable: number; restoreRate: number } };
  };
}

const PRODUCTS_QUERY = `query HilvanaProducts($first: Int!, $after: String) {
  shop { currencyCode }
  products(first: $first, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      description
      variants(first: 50) { nodes { id title sku price inventoryQuantity } }
    }
  }
}`;

export class ShopifyAdmin {
  readonly #options: Required<ShopifyAdminOptions>;

  constructor(options: ShopifyAdminOptions) {
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(options.shopDomain)) throw new Error('invalid shop domain');
    if (!/^\d{4}-\d{2}$/.test(options.apiVersion)) throw new Error('invalid Shopify API version');
    this.#options = {
      fetch: fetch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      timeoutMs: 15_000,
      ...options,
    };
  }

  async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const { shopDomain, apiVersion, accessToken } = this.#options;
    const response = await this.#options.fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(this.#options.timeoutMs),
    });
    if (!response.ok) throw new Error(`Shopify Admin API ${response.status}`);
    const json = await response.json() as GraphQLResponse<T>;
    if (json.errors?.length) throw new Error(`Shopify GraphQL: ${json.errors[0].message.slice(0, 200)}`);
    const throttle = json.extensions?.cost?.throttleStatus;
    const cost = json.extensions?.cost?.requestedQueryCost ?? 0;
    if (throttle && throttle.currentlyAvailable < cost && throttle.restoreRate > 0) {
      await this.#options.sleep(Math.ceil(((cost - throttle.currentlyAvailable) / throttle.restoreRate) * 1000));
    }
    if (!json.data) throw new Error('Shopify GraphQL returned no data');
    return json.data;
  }

  /** Recorre el catálogo activo y lo aplana a variantes con precio y existencias. */
  async fetchCatalog(pageSize = 50): Promise<CatalogVariant[]> {
    type Page = {
      shop: { currencyCode: string };
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          id: string;
          title: string;
          description: string;
          variants: {
            nodes: { id: string; title: string; sku: string | null; price: string; inventoryQuantity: number | null }[];
          };
        }[];
      };
    };
    const out: CatalogVariant[] = [];
    let after: string | null = null;
    for (let page = 0; page < 200; page++) {
      const data: Page = await this.query<Page>(PRODUCTS_QUERY, { first: pageSize, after });
      for (const product of data.products.nodes) {
        for (const variant of product.variants.nodes) {
          const price = Number(variant.price);
          out.push({
            externalRef: `shopify:variant:${variant.id.split('/').pop()}`,
            title: variant.title && variant.title !== 'Default Title'
              ? `${product.title} – ${variant.title}`
              : product.title,
            description: (product.description || product.title).slice(0, 3000),
            price: Number.isFinite(price) ? price : undefined,
            currency: data.shop.currencyCode,
            stock: typeof variant.inventoryQuantity === 'number' && variant.inventoryQuantity >= 0
              ? variant.inventoryQuantity
              : undefined,
          });
        }
      }
      if (!data.products.pageInfo.hasNextPage) break;
      after = data.products.pageInfo.endCursor;
    }
    return out;
  }
}

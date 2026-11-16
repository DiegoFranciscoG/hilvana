// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato shopify.products/update. No editar a mano.
export type ShopifyProductsUpdate = {
  admin_graphql_api_id: string;
  body_html: string;
  handle: string;
  id: number;
  status: "active";
  title: string;
  updated_at: string;
  variants: Array<{
    id: number;
    inventory_quantity: number;
    price: string;
    sku: string;
    title: string;
  }>;
};

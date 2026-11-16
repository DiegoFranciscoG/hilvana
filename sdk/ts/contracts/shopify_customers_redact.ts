// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato shopify.customers/redact. No editar a mano.
export type ShopifyCustomersRedact = {
  customer: {
    email: string;
    id: number;
    phone: string;
  };
  orders_to_redact: Array<number>;
  shop_domain: string;
  shop_id: number;
};

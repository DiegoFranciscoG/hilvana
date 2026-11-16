// SPDX-License-Identifier: MIT
/**
 * Conectores oficiales de Hilvana (licencia MIT, ver LICENSE en esta carpeta).
 * Solo APIs oficiales: WhatsApp Cloud API, Messenger Platform, Instagram Messaging y Shopify Admin
 * GraphQL. Ninguna librería que imite WhatsApp Web ni API privada.
 */
export * from './crypto.ts';
export * from './meta/signature.ts';
export * from './meta/graph.ts';
export * from './meta/messaging.ts';
export * from './whatsapp/parse.ts';
export * from './whatsapp/send.ts';
export * from './shopify/webhook.ts';
export * from './shopify/admin.ts';
export * from './window.ts';

/** Forma del secreto que se guarda en Vault por proveedor (los nombres coinciden con la base). */
export interface MetaSecret {
  appSecret: string;
  accessToken: string;
  verifyToken: string;
}
export interface ShopifySecret {
  clientSecret: string;
  accessToken: string;
}
export interface AiSecret {
  apiKey: string;
}

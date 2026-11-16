/**
 * Formato interno de Hilvana: cada conector traduce el webhook de su canal a este sobre.
 * Ver docs/modelo-datos.md, sección "Formato interno de mensajes".
 */

export const CHANNEL_TYPES = ['whatsapp', 'instagram', 'messenger', 'shopify'] as const;
export type ChannelType = typeof CHANNEL_TYPES[number];

export const MESSAGE_KINDS = [
  'text',
  'image',
  'audio',
  'video',
  'document',
  'location',
  'sticker',
  'reaction',
  'interactive',
  'template',
  'unsupported',
] as const;
export type MessageKind = typeof MESSAGE_KINDS[number];

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface ContactRef {
  /** Identificador del cliente en el canal: wa_id, PSID, IGSID o id de cliente de Shopify. */
  externalId: string;
  displayName?: string;
}

export interface InboundMessage {
  externalId: string;
  kind: MessageKind;
  text?: string;
  mediaId?: string;
  replyTo?: string;
}

export interface StatusUpdate {
  externalMessageId: string;
  status: DeliveryStatus;
  /** Código y título de error del canal, si lo hubo. */
  error?: { code: number; title: string };
  /** Categoría de precio informada por el canal (por ejemplo "service" o "utility"). */
  pricingCategory?: string;
  billable?: boolean;
}

export interface CatalogChange {
  action: 'upsert' | 'delete';
  externalRef: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  stock?: number;
}

export interface ComplianceRequest {
  topic: 'customers/data_request' | 'customers/redact' | 'shop/redact';
  customerExternalIds: string[];
}

export interface InboundEvent {
  v: 1;
  channel: ChannelType;
  kind: 'message' | 'status' | 'catalog' | 'compliance' | 'unknown';
  /** Clave estable del tipo de evento, por ejemplo "whatsapp.messages.text". */
  eventKey: string;
  /** phone_number_id, id de página, id de cuenta de Instagram o dominio de la tienda. */
  externalChannelId: string;
  occurredAt: string;
  contact?: ContactRef;
  message?: InboundMessage;
  status?: StatusUpdate;
  catalog?: CatalogChange;
  compliance?: ComplianceRequest;
}

export interface OutboundText {
  kind: 'text';
  text: string;
}

export interface OutboundTemplate {
  kind: 'template';
  name: string;
  languageCode: string;
  bodyParameters?: string[];
}

export type OutboundContent = OutboundText | OutboundTemplate;

export interface SendResult {
  externalMessageId: string;
}

/** Mensaje en cola tal como lo deja el Telar tras verificar la firma. */
export interface QueuedWebhook {
  v: 1;
  provider: 'meta' | 'shopify';
  credentialId: string;
  receivedAt: string;
  /** Cabeceras útiles del proveedor (tema de Shopify, id de entrega). */
  meta: Record<string, string>;
  payload: unknown;
}

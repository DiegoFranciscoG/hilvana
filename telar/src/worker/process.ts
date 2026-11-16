/**
 * Procesa un webhook encolado dentro de la transacción del espacio:
 *  - laboratorio de contratos (anónimo, en un savepoint: si falla, el mensaje sigue);
 *  - contactos, conversaciones y mensajes con idempotencia por id del canal (T-02);
 *  - estados de entrega, catálogo de Shopify y webhooks de cumplimiento.
 * Devuelve las respuestas automáticas pendientes, que se resuelven fuera de la transacción.
 */
import type { ChannelType, InboundEvent, QueuedWebhook } from '../../../sdk/ts/envelope.ts';
import { messagingChannelOf, parseMessagingWebhook } from '../../connectors/meta/messaging.ts';
import { parseShopifyWebhook } from '../../connectors/shopify/webhook.ts';
import { isWhatsAppPayload, parseWhatsAppWebhook } from '../../connectors/whatsapp/parse.ts';
import { windowDeadlines } from '../../connectors/window.ts';
import { captureWebhook } from '../../../lab/src/capture.ts';
import type { LabConfig } from '../../../lab/src/anonymize.ts';
import type { TelarConfig } from '../config.ts';
import type { Tx } from '../db.ts';
import type { Logger } from '../log.ts';
import { PgContractStore } from '../pg/contracts.ts';
import { upsertChunk } from '../pg/knowledge.ts';

export interface ReplyTask {
  conversationId: string;
  inboundMessageId: string;
  channelType: ChannelType;
  credentialId: string;
}

export interface ProcessDeps {
  workspaceId: string;
  config: Pick<TelarConfig, 'labCapture' | 'policies'>;
  labConfig: LabConfig;
  logger: Logger;
}

export function eventsOf(message: QueuedWebhook, shopCurrency = 'USD'): { channel: ChannelType; events: InboundEvent[] } {
  if (message.provider === 'shopify') {
    return {
      channel: 'shopify',
      events: parseShopifyWebhook(message.meta.topic ?? 'unknown', message.meta.shop ?? '', message.payload, shopCurrency),
    };
  }
  if (isWhatsAppPayload(message.payload)) return { channel: 'whatsapp', events: parseWhatsAppWebhook(message.payload) };
  const channel = messagingChannelOf(message.payload);
  return channel ? { channel, events: parseMessagingWebhook(message.payload) } : { channel: 'whatsapp', events: [] };
}

function preview(event: InboundEvent): string {
  const text = event.message?.text?.trim();
  if (text) return text.slice(0, 160);
  return `[${event.message?.kind ?? 'mensaje'}]`;
}

async function resolveChannel(tx: Tx, type: ChannelType, externalId: string, credentialId: string): Promise<string | null> {
  const [row] = await tx<{ id: string | null }[]>`select private.telar_resolve_channel(${type}, ${externalId}, ${credentialId}::uuid) as id`;
  return row?.id ?? null;
}

async function handleMessage(tx: Tx, deps: ProcessDeps, event: InboundEvent, credentialId: string): Promise<ReplyTask | null> {
  if (!event.contact || !event.message) return null;
  const channelId = await resolveChannel(tx, event.channel, event.externalChannelId, credentialId);
  if (!channelId) {
    deps.logger.warn('webhook_unknown_channel', { channel: event.channel, workspaceId: deps.workspaceId });
    return null;
  }
  const occurredAt = new Date(event.occurredAt);
  const [contact] = await tx<{ id: string }[]>`
    insert into public.contact (workspace_id, channel_id, external_id, display_name, last_inbound_at)
    values (${deps.workspaceId}, ${channelId}, ${event.contact.externalId}, ${event.contact.displayName?.slice(0, 120) ?? null}, ${occurredAt})
    on conflict (channel_id, external_id) do update set
      display_name = coalesce(excluded.display_name, contact.display_name),
      last_inbound_at = greatest(contact.last_inbound_at, excluded.last_inbound_at)
    returning id`;

  await tx`
    insert into public.conversation (workspace_id, channel_id, contact_id, last_message_at)
    values (${deps.workspaceId}, ${channelId}, ${contact.id}, ${occurredAt})
    on conflict (contact_id) where status <> 'closed' do nothing`;
  const [conversation] = await tx<{ id: string; status: string }[]>`
    select id, status from public.conversation where contact_id = ${contact.id} and status <> 'closed' for update`;

  const inserted = await tx<{ id: string }[]>`
    insert into public.message
      (workspace_id, conversation_id, channel_id, direction, author, channel_message_id, kind, body, payload, status, created_at)
    values (${deps.workspaceId}, ${conversation.id}, ${channelId}, 'inbound', 'contact', ${event.message.externalId},
            ${event.message.kind}, ${event.message.text?.slice(0, 4096) ?? null},
            ${tx.json({ mediaId: event.message.mediaId ?? null, replyTo: event.message.replyTo ?? null })}, 'received', ${occurredAt})
    on conflict (channel_id, channel_message_id) where channel_message_id is not null do nothing
    returning id`;

  let messageId: string;
  if (inserted.length > 0) {
    messageId = inserted[0].id;
    const deadlines = windowDeadlines(deps.config.policies, event.channel, occurredAt);
    await tx`
      update public.conversation set
        window_expires_at = greatest(coalesce(window_expires_at, ${deadlines.serviceUntil}), ${deadlines.serviceUntil}),
        human_window_expires_at = ${deadlines.humanUntil},
        last_message_at = greatest(last_message_at, ${occurredAt}),
        last_message_preview = ${preview(event)},
        unread_count = unread_count + 1
      where id = ${conversation.id}`;
    await tx`
      insert into public.usage_daily (workspace_id, day, messages_in) values (${deps.workspaceId}, current_date, 1)
      on conflict (workspace_id, day) do update set messages_in = usage_daily.messages_in + 1`;
  } else {
    // Webhook repetido (Meta reintenta hasta 36 h): no crea otro mensaje. Si la respuesta automática
    // nunca se registró (caída a mitad de camino), se vuelve a intentar; el índice único la deja pasar una sola vez.
    const [existing] = await tx<{ id: string }[]>`
      select id from public.message where channel_id = ${channelId} and channel_message_id = ${event.message.externalId}`;
    messageId = existing.id;
  }

  const replyable = conversation.status === 'agent' && Boolean(event.message.text) &&
    ['text', 'interactive'].includes(event.message.kind);
  if (!replyable) return null;
  const [answered] = await tx<{ answered: boolean }[]>`
    select exists (select 1 from public.message where in_reply_to = ${messageId} and author = 'agent') as answered`;
  if (answered.answered) return null;
  return { conversationId: conversation.id, inboundMessageId: messageId, channelType: event.channel, credentialId };
}

async function handleStatus(tx: Tx, event: InboundEvent, credentialId: string): Promise<void> {
  if (!event.status) return;
  const channelId = await resolveChannel(tx, event.channel, event.externalChannelId, credentialId);
  if (!channelId) return;
  // Solo avanza: sent → delivered → read; failed queda registrado con su error.
  const order = ['queued', 'sent', 'delivered', 'read'];
  const next = event.status.status;
  await tx`
    update public.message set
      status = ${next},
      error = ${event.status.error ? tx.json(event.status.error) : null}
    where channel_id = ${channelId} and channel_message_id = ${event.status.externalMessageId} and direction = 'outbound'
      and (${next} = 'failed' or array_position(${order}::text[], status) < array_position(${order}::text[], ${next}))`;
}

async function handleCatalog(tx: Tx, deps: ProcessDeps, event: InboundEvent, credentialId: string): Promise<void> {
  if (!event.catalog) return;
  const channelId = await resolveChannel(tx, 'shopify', event.externalChannelId, credentialId);
  if (!channelId) return;
  const change = event.catalog;
  if (change.action === 'delete') {
    const prefix = change.externalRef.startsWith('shopify:product:') ? null : change.externalRef;
    if (prefix) await tx`delete from public.knowledge_chunk where external_ref = ${prefix}`;
    return;
  }
  await upsertChunk(tx, deps.workspaceId, {
    source: 'catalog',
    externalRef: change.externalRef,
    title: change.title ?? 'Producto',
    content: change.description ?? change.title ?? 'Producto',
    price: change.price,
    currency: change.currency,
    stock: change.stock,
  });
}

async function handleCompliance(tx: Tx, deps: ProcessDeps, event: InboundEvent, credentialId: string): Promise<void> {
  if (!event.compliance) return;
  const channelId = await resolveChannel(tx, 'shopify', event.externalChannelId, credentialId);
  const ids = event.compliance.customerExternalIds;
  let affected = 0;
  if (event.compliance.topic === 'customers/redact' && channelId && ids.length) {
    const deleted = await tx`delete from public.contact where channel_id = ${channelId} and external_id = any(${ids}) returning id`;
    affected = deleted.length;
  }
  if (event.compliance.topic === 'shop/redact') {
    const deleted = await tx`delete from public.knowledge_chunk where external_ref like 'shopify:%' returning id`;
    affected = deleted.length;
  }
  // customers/data_request: Hilvana no guarda clientes de Shopify fuera de los contactos de canales de Meta;
  // la solicitud queda auditada para que el dueño la responda en el plazo legal.
  await tx`
    insert into public.audit_log (workspace_id, actor_kind, action, entity, entity_id, details)
    values (${deps.workspaceId}, 'service', 'event', 'shopify_compliance', ${event.compliance.topic},
            ${tx.json({ topic: event.compliance.topic, affectedRows: affected })})`;
}

export async function processWebhook(tx: Tx, deps: ProcessDeps, message: QueuedWebhook): Promise<ReplyTask[]> {
  let currency = 'USD';
  if (message.provider === 'shopify') {
    const [row] = await tx<{ currency: string | null }[]>`
      select public_config ->> 'currency' as currency from public.credential where id = ${message.credentialId}`;
    if (row?.currency && /^[A-Z]{3}$/.test(row.currency)) currency = row.currency;
  }
  const { channel, events } = eventsOf(message, currency);

  if (deps.config.labCapture) {
    try {
      await tx.savepoint(async (sp) => {
        await captureWebhook(new PgContractStore(sp, deps.workspaceId), deps.labConfig, {
          channel,
          eventKeys: [...new Set(events.map((e) => e.eventKey))],
          payload: message.payload,
        });
      });
    } catch (error) {
      deps.logger.warn('lab_capture_failed', { workspaceId: deps.workspaceId, error });
    }
  }

  const tasks: ReplyTask[] = [];
  for (const event of events) {
    if (event.kind === 'message') {
      const task = await handleMessage(tx, deps, event, message.credentialId);
      if (task) tasks.push(task);
    } else if (event.kind === 'status') await handleStatus(tx, event, message.credentialId);
    else if (event.kind === 'catalog') await handleCatalog(tx, deps, event, message.credentialId);
    else if (event.kind === 'compliance') await handleCompliance(tx, deps, event, message.credentialId);
  }
  return tasks;
}

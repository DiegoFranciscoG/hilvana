// SPDX-License-Identifier: MIT
/**
 * Envío por WhatsApp Cloud API: POST /{version}/{phone-number-id}/messages (#22, #23).
 * Texto libre solo dentro de la ventana de 24 h; fuera de ella, plantilla aprobada (ver window.ts).
 */
import type { OutboundContent, SendResult } from '../../../sdk/ts/envelope.ts';
import type { GraphClient } from '../meta/graph.ts';

const MAX_TEXT = 4096;

export function buildWhatsAppBody(to: string, content: OutboundContent): Record<string, unknown> {
  if (!/^\d{6,20}$/.test(to)) throw new Error('invalid WhatsApp recipient');
  if (content.kind === 'text') {
    const text = content.text.trim();
    if (text.length === 0 || text.length > MAX_TEXT) throw new Error('invalid text length');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    };
  }
  if (!/^[a-z0-9_]{1,512}$/.test(content.name)) throw new Error('invalid template name');
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: content.name,
      language: { code: content.languageCode },
      components: content.bodyParameters && content.bodyParameters.length > 0
        ? [{ type: 'body', parameters: content.bodyParameters.map((text) => ({ type: 'text', text })) }]
        : [],
    },
  };
}

export async function sendWhatsApp(
  client: GraphClient,
  phoneNumberId: string,
  to: string,
  content: OutboundContent,
): Promise<SendResult> {
  if (!/^\d{1,32}$/.test(phoneNumberId)) throw new Error('invalid phone number id');
  const response = await client.post<{ messages?: { id?: string }[] }>(
    `${phoneNumberId}/messages`,
    buildWhatsAppBody(to, content),
  );
  const id = response.messages?.[0]?.id;
  if (!id) throw new Error('WhatsApp did not return a message id');
  return { externalMessageId: id };
}

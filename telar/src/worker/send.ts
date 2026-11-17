/** Envío por el conector del canal, con la versión de Graph API y los hosts del archivo de datos. */
import type { ChannelType, OutboundContent, SendResult } from '../../../sdk/ts/envelope.ts';
import { GraphClient } from '../../connectors/meta/graph.ts';
import { sendMessaging } from '../../connectors/meta/messaging.ts';
import { sendWhatsApp } from '../../connectors/whatsapp/send.ts';
import type { TelarConfig } from '../config.ts';

export interface SendTarget {
  channel: ChannelType;
  externalChannelId: string;
  recipientId: string;
  accessToken: string;
}

export type Sender = (
  target: SendTarget,
  content: OutboundContent,
  options: { humanAgentTag?: boolean },
) => Promise<SendResult>;

export function createSender(meta: TelarConfig['meta'], fetchFn: typeof fetch = fetch): Sender {
  return (target, content, options) => {
    if (target.channel === 'shopify') return Promise.reject(new Error('shopify is not a messaging channel'));
    const client = new GraphClient({
      baseUrl: meta.hosts[target.channel],
      version: meta.graphApiVersion,
      accessToken: target.accessToken,
      fetch: fetchFn,
    });
    if (target.channel === 'whatsapp') {
      return sendWhatsApp(client, target.externalChannelId, target.recipientId, content);
    }
    return sendMessaging(client, target.externalChannelId, target.recipientId, content, options);
  };
}

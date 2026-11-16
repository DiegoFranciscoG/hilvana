/** Puertos que usa la capa HTTP. La implementación real habla con Postgres; las pruebas usan dobles. */
import type { QueuedWebhook } from '../../sdk/ts/envelope.ts';

export interface ResolvedCredential {
  workspaceId: string;
  provider: 'meta' | 'shopify' | 'ai';
  status: 'active' | 'expired' | 'revoked';
  publicConfig: Record<string, unknown>;
}

export interface IngestPort {
  resolveCredential(credentialId: string): Promise<ResolvedCredential | null>;
  credentialSecret(workspaceId: string, credentialId: string): Promise<Record<string, string>>;
  enqueue(workspaceId: string, message: QueuedWebhook): Promise<number>;
  /** false si la entrega ya se había recibido (deduplicación por id de entrega). */
  markDelivery(provider: 'meta' | 'shopify', deliveryId: string, workspaceId: string): Promise<boolean>;
  ping(): Promise<boolean>;
}

export interface HumanReplyResult {
  status: 'sent' | 'blocked' | 'failed';
  reason?: string;
  messageId?: string;
}

export interface ApiPort {
  memberRole(workspaceId: string, userId: string): Promise<'owner' | 'agent' | 'viewer' | null>;
  conversationWorkspace(conversationId: string): Promise<string | null>;
  sendHumanReply(input: { workspaceId: string; conversationId: string; userId: string; text: string }): Promise<HumanReplyResult>;
  deleteAccount(userId: string): Promise<Record<string, unknown>>;
  previewAgent(input: { workspaceId: string; spec?: unknown; message: string }): Promise<{ action: string; text: string; flags: string[] }>;
  syncShopifyCatalog(workspaceId: string): Promise<{ upserted: number }>;
}

export interface Drainer {
  drainOnce(onlyWorkspace?: string): Promise<{ processed: number; deferred: number; workspaces: number }>;
}

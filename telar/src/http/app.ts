/**
 * Aplicación HTTP del Telar (Hono). Los webhooks verifican la firma sobre el cuerpo crudo, encolan y
 * responden 200 de inmediato (T-01); el trabajo pesado lo hace el trabajador. La API de la bandeja
 * exige el JWT de Supabase Auth y valida el rol del usuario en el espacio.
 */
import { type Context, Hono } from '@hono/hono';
import { bodyLimit } from '@hono/hono/body-limit';
import { cors } from '@hono/hono/cors';
import { secureHeaders } from '@hono/hono/secure-headers';
import type { QueuedWebhook } from '../../../sdk/ts/envelope.ts';
import { timingSafeEqualText } from '../../connectors/crypto.ts';
import { answerVerification, verifyMetaSignature } from '../../connectors/meta/signature.ts';
import { verifyShopifyHmac } from '../../connectors/shopify/webhook.ts';
import { answerInterview, type ConfiguratorConfig, startInterview } from '../../../agent/src/configurator.ts';
import type { Logger } from '../log.ts';
import type { ApiPort, Drainer, IngestPort } from '../ports.ts';
import type { VerifiedUser } from '../jwt.ts';
import { openApiDocument } from './openapi.ts';
import { RateLimiter } from './rate_limit.ts';

export interface AppDeps {
  ingest: IngestPort;
  api?: ApiPort;
  drainer?: Drainer;
  verifyUser: (token: string) => Promise<VerifiedUser | null>;
  logger: Logger;
  allowedOrigins: string[];
  drainToken?: string;
  maxWebhookBytes: number;
  configurator?: ConfiguratorConfig;
  webhookRatePerMinute?: number;
  apiRatePerMinute?: number;
}

type Env = { Variables: { user: VerifiedUser; requestId: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createApp(deps: AppDeps): Hono<Env> {
  const app = new Hono<Env>();
  const webhookLimiter = new RateLimiter(deps.webhookRatePerMinute ?? 1200);
  const apiLimiter = new RateLimiter(deps.apiRatePerMinute ?? 120);

  app.use('*', async (c, next) => {
    const id = crypto.randomUUID();
    c.set('requestId', id);
    await next();
    c.header('X-Request-Id', id);
  });
  app.use('*', secureHeaders({ contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }));
  app.use(
    '/api/*',
    cors({
      origin: (origin) => (deps.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );

  app.onError((error, c) => {
    deps.logger.error('http_error', { path: c.req.path, requestId: c.get('requestId'), error });
    return c.json({ error: 'internal_error', requestId: c.get('requestId') }, 500);
  });
  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.get('/healthz', (c) => c.json({ status: 'ok' }));
  app.get(
    '/readyz',
    async (
      c,
    ) => ((await deps.ingest.ping().catch(() => false))
      ? c.json({ status: 'ready' })
      : c.json({ status: 'unavailable' }, 503)),
  );
  app.get('/openapi.json', (c) => c.json(openApiDocument));

  const webhookBody = bodyLimit({
    maxSize: deps.maxWebhookBytes,
    onError: (c) => c.json({ error: 'payload_too_large' }, 413),
  });

  const credentialFor = async (c: Context<Env>, provider: 'meta' | 'shopify') => {
    const credentialId = c.req.param('credentialId') ?? '';
    if (!UUID.test(credentialId)) return null;
    if (!webhookLimiter.take(`${provider}:${credentialId}`)) return 'limited' as const;
    const credential = await deps.ingest.resolveCredential(credentialId);
    if (!credential || credential.provider !== provider || credential.status !== 'active') return null;
    return { credentialId, ...credential };
  };

  // Meta: verificación del endpoint (#21).
  app.get('/webhooks/meta/:credentialId', async (c) => {
    const credential = await credentialFor(c, 'meta');
    if (credential === 'limited') return c.text('too many requests', 429);
    if (!credential) return c.text('forbidden', 403);
    const secret = await deps.ingest.credentialSecret(credential.workspaceId, credential.credentialId);
    const challenge = answerVerification(new URL(c.req.url).searchParams, secret.verifyToken ?? '');
    return challenge ? c.text(challenge, 200) : c.text('forbidden', 403);
  });

  // Meta: eventos firmados (T-01).
  app.post('/webhooks/meta/:credentialId', webhookBody, async (c) => {
    const credential = await credentialFor(c, 'meta');
    if (credential === 'limited') return c.text('too many requests', 429);
    if (!credential) return c.json({ error: 'unknown_credential' }, 404);
    const raw = new Uint8Array(await c.req.arrayBuffer());
    const secret = await deps.ingest.credentialSecret(credential.workspaceId, credential.credentialId);
    if (!(await verifyMetaSignature(raw, c.req.header('x-hub-signature-256'), secret.appSecret ?? ''))) {
      deps.logger.warn('webhook_bad_signature', { provider: 'meta', credentialId: credential.credentialId });
      return c.json({ error: 'invalid_signature' }, 401);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const message: QueuedWebhook = {
      v: 1,
      provider: 'meta',
      credentialId: credential.credentialId,
      receivedAt: new Date().toISOString(),
      meta: {},
      payload,
    };
    await deps.ingest.enqueue(credential.workspaceId, message);
    return c.text('EVENT_RECEIVED', 200);
  });

  // Shopify: HMAC en base64, deduplicación por X-Shopify-Webhook-Id (#32, #33).
  app.post('/webhooks/shopify/:credentialId', webhookBody, async (c) => {
    const credential = await credentialFor(c, 'shopify');
    if (credential === 'limited') return c.text('too many requests', 429);
    if (!credential) return c.json({ error: 'unknown_credential' }, 404);
    const raw = new Uint8Array(await c.req.arrayBuffer());
    const secret = await deps.ingest.credentialSecret(credential.workspaceId, credential.credentialId);
    if (!(await verifyShopifyHmac(raw, c.req.header('x-shopify-hmac-sha256'), secret.clientSecret ?? ''))) {
      deps.logger.warn('webhook_bad_signature', { provider: 'shopify', credentialId: credential.credentialId });
      return c.json({ error: 'invalid_hmac' }, 401);
    }
    const topic = c.req.header('x-shopify-topic') ?? 'unknown';
    const shop = c.req.header('x-shopify-shop-domain') ?? String(credential.publicConfig.shopDomain ?? '');
    const deliveryId = c.req.header('x-shopify-webhook-id') ?? '';
    if (!/^[a-z_]+\/[a-z_]+$/.test(topic) || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      return c.json({ error: 'invalid_headers' }, 400);
    }
    if (deliveryId && !(await deps.ingest.markDelivery('shopify', deliveryId.slice(0, 200), credential.workspaceId))) {
      return c.text('DUPLICATE', 200);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    await deps.ingest.enqueue(credential.workspaceId, {
      v: 1,
      provider: 'shopify',
      credentialId: credential.credentialId,
      receivedAt: new Date().toISOString(),
      meta: { topic, shop, deliveryId },
      payload,
    });
    return c.text('OK', 200);
  });

  // Drenado interno (despliegue en la nube; lo despierta pg_net al encolar).
  app.post('/internal/drain', async (c) => {
    if (!deps.drainToken || !deps.drainer) return c.json({ error: 'not_found' }, 404);
    const auth = c.req.header('authorization') ?? '';
    if (!timingSafeEqualText(auth, `Bearer ${deps.drainToken}`)) return c.json({ error: 'unauthorized' }, 401);
    const body = await c.req.json().catch(() => ({})) as { workspaceId?: string };
    const only = body.workspaceId && UUID.test(body.workspaceId) ? body.workspaceId : undefined;
    return c.json(await deps.drainer.drainOnce(only));
  });

  // API de la bandeja: JWT de Supabase Auth.
  app.use('/api/*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = token ? await deps.verifyUser(token).catch(() => null) : null;
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    if (!apiLimiter.take(`user:${user.userId}`)) return c.json({ error: 'rate_limited' }, 429);
    c.set('user', user);
    await next();
  });

  const requireApi = () => {
    if (!deps.api) throw new Error('API not configured');
    return deps.api;
  };

  app.post('/api/conversations/:conversationId/messages', bodyLimit({ maxSize: 16_384 }), async (c) => {
    const api = requireApi();
    const conversationId = c.req.param('conversationId');
    if (!UUID.test(conversationId)) return c.json({ error: 'invalid_id' }, 400);
    const body = await c.req.json().catch(() => null) as { text?: unknown } | null;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (text.length === 0 || text.length > 4096) return c.json({ error: 'invalid_text' }, 400);
    const workspaceId = await api.conversationWorkspace(conversationId);
    const user = c.get('user');
    const role = workspaceId ? await api.memberRole(workspaceId, user.userId) : null;
    if (!workspaceId || (role !== 'owner' && role !== 'agent')) return c.json({ error: 'forbidden' }, 403);
    const result = await api.sendHumanReply({ workspaceId, conversationId, userId: user.userId, text });
    if (result.status === 'blocked') return c.json({ error: 'window_closed', reason: result.reason }, 409);
    if (result.status === 'failed') return c.json({ error: 'send_failed' }, 502);
    return c.json({ status: 'sent', messageId: result.messageId }, 202);
  });

  app.delete('/api/account', async (c) => {
    const api = requireApi();
    const summary = await api.deleteAccount(c.get('user').userId);
    deps.logger.info('account_deleted', { userId: c.get('user').userId });
    return c.json({ status: 'deleted', ...summary });
  });

  app.post('/api/workspaces/:workspaceId/agent/preview', bodyLimit({ maxSize: 65_536 }), async (c) => {
    const api = requireApi();
    const workspaceId = c.req.param('workspaceId');
    if (!UUID.test(workspaceId)) return c.json({ error: 'invalid_id' }, 400);
    if ((await api.memberRole(workspaceId, c.get('user').userId)) !== 'owner') {
      return c.json({ error: 'forbidden' }, 403);
    }
    const body = await c.req.json().catch(() => null) as { message?: unknown; spec?: unknown } | null;
    const message = typeof body?.message === 'string' ? body.message.slice(0, 1000) : '';
    if (!message) return c.json({ error: 'invalid_message' }, 400);
    return c.json(await api.previewAgent({ workspaceId, spec: body?.spec, message }));
  });

  app.post('/api/configurator/answer', bodyLimit({ maxSize: 32_768 }), async (c) => {
    if (!deps.configurator) return c.json({ error: 'not_configured' }, 503);
    const body = await c.req.json().catch(() => null) as {
      state?: { step?: unknown; answers?: unknown };
      text?: unknown;
    } | null;
    if (!body?.state) return c.json(startInterview(deps.configurator));
    const step = Number(body.state.step);
    const answers = body.state.answers && typeof body.state.answers === 'object'
      ? body.state.answers as Record<string, unknown>
      : {};
    if (
      !Number.isInteger(step) || step < 0 || step >= deps.configurator.questions.length || typeof body.text !== 'string'
    ) {
      return c.json({ error: 'invalid_state' }, 400);
    }
    return c.json(answerInterview(deps.configurator, { step, answers }, body.text.slice(0, 2000)));
  });

  app.post('/api/workspaces/:workspaceId/catalog/sync', async (c) => {
    const api = requireApi();
    const workspaceId = c.req.param('workspaceId');
    if (!UUID.test(workspaceId)) return c.json({ error: 'invalid_id' }, 400);
    if ((await api.memberRole(workspaceId, c.get('user').userId)) !== 'owner') {
      return c.json({ error: 'forbidden' }, 403);
    }
    return c.json(await api.syncShopifyCatalog(workspaceId));
  });

  return app;
}

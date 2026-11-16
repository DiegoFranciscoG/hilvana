/** Documento OpenAPI 3.1 de la API del Telar (servido en GET /openapi.json). */
export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Hilvana Telar',
    version: '0.1.0',
    description: 'Pasarela de webhooks oficiales (WhatsApp, Instagram, Messenger, Shopify) y API de la bandeja.',
    license: { name: 'AGPL-3.0-or-later', identifier: 'AGPL-3.0-or-later' },
  },
  components: {
    securitySchemes: {
      supabaseJwt: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token de sesión de Supabase Auth' },
      drainToken: { type: 'http', scheme: 'bearer', description: 'Token interno del drenado (solo despliegue en la nube)' },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: { error: { type: 'string' }, requestId: { type: 'string' } },
      },
    },
  },
  paths: {
    '/healthz': { get: { summary: 'Vida del proceso', responses: { '200': { description: 'ok' } } } },
    '/readyz': { get: { summary: 'Lista para atender (base disponible)', responses: { '200': { description: 'ok' }, '503': { description: 'sin base' } } } },
    '/webhooks/meta/{credentialId}': {
      parameters: [{ name: 'credentialId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        summary: 'Verificación del webhook de Meta (hub.challenge)',
        responses: { '200': { description: 'challenge' }, '403': { description: 'token inválido' } },
      },
      post: {
        summary: 'Webhook de WhatsApp, Messenger o Instagram (X-Hub-Signature-256)',
        responses: { '200': { description: 'encolado' }, '401': { description: 'firma inválida' }, '404': { description: 'credencial desconocida' } },
      },
    },
    '/webhooks/shopify/{credentialId}': {
      parameters: [{ name: 'credentialId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        summary: 'Webhook de Shopify (X-Shopify-Hmac-SHA256), incluidos los de cumplimiento',
        responses: { '200': { description: 'encolado o repetido' }, '401': { description: 'HMAC inválido' } },
      },
    },
    '/api/conversations/{conversationId}/messages': {
      post: {
        summary: 'Respuesta de una persona del equipo (respeta la ventana del canal)',
        security: [{ supabaseJwt: [] }],
        parameters: [{ name: 'conversationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', maxLength: 4096 } } } } },
        },
        responses: {
          '202': { description: 'enviado' },
          '409': { description: 'ventana cerrada: usar plantilla' },
          '403': { description: 'sin permiso' },
        },
      },
    },
    '/api/account': {
      delete: {
        summary: 'Eliminar la cuenta y sus datos (Apple 5.1.1(v), Google Play)',
        security: [{ supabaseJwt: [] }],
        responses: { '200': { description: 'cuenta eliminada' } },
      },
    },
    '/api/workspaces/{workspaceId}/agent/preview': {
      post: {
        summary: 'Vista previa de la respuesta del agente con una especificación borrador',
        security: [{ supabaseJwt: [] }],
        parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'decisión del agente' } },
      },
    },
    '/api/configurator/answer': {
      post: {
        summary: 'Siguiente paso de la entrevista del configurador',
        security: [{ supabaseJwt: [] }],
        responses: { '200': { description: 'pregunta siguiente o especificación' } },
      },
    },
    '/api/workspaces/{workspaceId}/catalog/sync': {
      post: {
        summary: 'Sincronizar el catálogo desde Shopify Admin GraphQL',
        security: [{ supabaseJwt: [] }],
        parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'ítems actualizados' } },
      },
    },
    '/internal/drain': {
      post: { summary: 'Drenar colas (despliegue en la nube)', security: [{ drainToken: [] }], responses: { '200': { description: 'resumen' } } },
    },
  },
} as const;

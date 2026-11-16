/** Contrato común de los proveedores de modelo: el agente no depende de ningún proveedor. */
import type { ModelOutput } from '../guardrails.ts';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ModelRequest {
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
}

export interface ModelResponse {
  output: unknown;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ModelProvider {
  readonly name: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

/** Esquema JSON que se pide al modelo (salida estructurada). */
export const MODEL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'intent', 'mentionedProducts', 'leadInterest'],
  properties: {
    reply: { type: 'string', description: 'Respuesta para el cliente, en su idioma, breve.' },
    intent: { type: 'string', enum: ['answer', 'handoff', 'lead', 'out_of_scope'] },
    mentionedProducts: {
      type: 'array',
      items: { type: 'string' },
      description: 'Títulos exactos del catálogo que la respuesta menciona.',
    },
    leadInterest: { type: ['string', 'null'], description: 'Interés de compra resumido, si lo hay.' },
  },
} as const;

export type { ModelOutput };

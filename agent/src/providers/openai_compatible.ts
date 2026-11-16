/**
 * Proveedor para cualquier API compatible con "chat completions" (servicios en la nube o modelos
 * locales como Ollama, LM Studio o vLLM). Cada espacio elige URL, modelo y su propia clave (Vault).
 * Pide salida estructurada con JSON Schema; si el servidor no la soporta, la respuesta igual se
 * valida y, si no cumple, el agente deriva a una persona.
 */
import { MODEL_OUTPUT_SCHEMA, type ModelProvider, type ModelRequest, type ModelResponse } from './types.ts';

export interface OpenAICompatibleOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name = 'openai-compatible';
  readonly #options: OpenAICompatibleOptions;

  constructor(options: OpenAICompatibleOptions) {
    const url = new URL(options.baseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) throw new Error('model endpoint must use https');
    if (!/^[A-Za-z0-9._:/-]{1,120}$/.test(options.model)) throw new Error('invalid model name');
    this.#options = options;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const { baseUrl, model, apiKey, temperature = 0.2, timeoutMs = 20_000 } = this.#options;
    const response = await (this.#options.fetch ?? fetch)(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: request.maxOutputTokens,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'hilvana_reply', strict: true, schema: MODEL_OUTPUT_SCHEMA },
        },
        messages: [{ role: 'system', content: request.system }, ...request.messages],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`model endpoint returned ${response.status}`);
    }
    const json = await response.json() as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content ?? '';
    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      output = { invalid: true };
    }
    return {
      output,
      usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
    };
  }
}

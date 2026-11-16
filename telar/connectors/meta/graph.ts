// SPDX-License-Identifier: MIT
/** Cliente mínimo de la Graph API. El token nunca se escribe en errores ni en registros. */

export interface GraphClientOptions {
  baseUrl: string;
  version: string;
  accessToken: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class GraphError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number | undefined,
    readonly subcode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }

  /** Errores que vale la pena reintentar (límite de tasa o fallas del servidor). */
  get retryable(): boolean {
    return this.httpStatus === 429 || this.httpStatus >= 500 || this.code === 4 || this.code === 80007;
  }
}

export class GraphClient {
  readonly #options: Required<Omit<GraphClientOptions, 'fetch'>> & { fetch: typeof fetch };

  constructor(options: GraphClientOptions) {
    if (!/^v\d+\.\d+$/.test(options.version)) throw new Error('invalid Graph API version');
    this.#options = {
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
      version: options.version,
      accessToken: options.accessToken,
      fetch: options.fetch ?? fetch,
      timeoutMs: options.timeoutMs ?? 10_000,
    };
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    if (!/^[A-Za-z0-9_/.-]+$/.test(path)) throw new Error('invalid Graph API path');
    const url = `${this.#options.baseUrl}/${this.#options.version}/${path}`;
    const response = await this.#options.fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#options.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.#options.timeoutMs),
    });
    const json = await response.json().catch(() => ({})) as {
      error?: { code?: number; error_subcode?: number; message?: string; type?: string };
    };
    if (!response.ok) {
      const error = json.error ?? {};
      throw new GraphError(
        response.status,
        error.code,
        error.error_subcode,
        `Graph API ${response.status}${error.code ? ` (code ${error.code})` : ''}: ${
          (error.message ?? 'request failed').slice(0, 200)
        }`,
      );
    }
    return json as T;
  }
}

/**
 * Proveedores sin modelo de lenguaje:
 *  - CatalogResponder: responde precios, disponibilidad y horario directamente desde el catálogo
 *    (demo local sin claves ni red).
 *  - ScriptedProvider: devuelve salidas preparadas; lo usan las pruebas y la evaluación T-06,
 *    incluso con salidas "adversarias" que inventan precios o filtran el prompt.
 */
import { normalizeText, tokens } from '../knowledge.ts';
import type { ModelProvider, ModelRequest, ModelResponse } from './types.ts';

interface CatalogRow {
  title: string;
  detail: string;
  price: number | null;
  currency: string | null;
  stock: number | null;
}

function lastCustomerText(request: ModelRequest): string {
  const last = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const match = last.match(/"""\n([\s\S]*)\n"""/);
  return match ? match[1] : last;
}

function catalogFrom(system: string): CatalogRow[] {
  const match = system.match(/BEGIN_CATALOG\n([\s\S]*?)\nEND_CATALOG/);
  try {
    return match ? JSON.parse(match[1]) : [];
  } catch {
    return [];
  }
}

function formatMoney(amount: number, currency: string | null): string {
  const symbol = currency === 'USD' ? '$' : currency === 'PEN' ? 'S/' : `${currency ?? ''} `;
  return `${symbol}${amount.toFixed(2)}`;
}

export class CatalogResponder implements ModelProvider {
  readonly name = 'catalog-responder';

  complete(request: ModelRequest): Promise<ModelResponse> {
    const text = lastCustomerText(request);
    const words = tokens(text);
    const normalized = normalizeText(text);
    const catalog = catalogFrom(request.system);
    const asksHours = /\b(horario|abren|atienden|cierran|hora)\b/.test(normalized);
    const asksPrice = /\b(cuanto|precio|vale|cuesta|costo)\b/.test(normalized);

    const best = catalog
      .map((row) => {
        const rowWords = new Set(tokens(`${row.title} ${row.detail}`));
        return { row, score: words.filter((w) => rowWords.has(w)).length };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.row;

    let output: Record<string, unknown>;
    if (asksHours && !best) {
      const hours = request.system.match(/^Horario: (.*)$/m)?.[1] ?? 'consulta con el equipo';
      output = { reply: `Atendemos ${hours}`, intent: 'answer', mentionedProducts: [], leadInterest: null };
    } else if (best) {
      const parts = [best.title + (best.detail && best.detail !== best.title ? `: ${best.detail}` : '') + '.'];
      if (asksPrice && best.price !== null) parts.push(`Cuesta ${formatMoney(best.price, best.currency)}.`);
      if (best.stock !== null) parts.push(best.stock > 0 ? `Hay ${best.stock} disponibles.` : 'Por ahora está agotado.');
      output = { reply: parts.join(' '), intent: 'answer', mentionedProducts: [best.title], leadInterest: best.title };
    } else if (words.length === 0) {
      output = { reply: '¡Hola! ¿En qué te puedo ayudar?', intent: 'answer', mentionedProducts: [], leadInterest: null };
    } else {
      output = {
        reply: 'No encuentro eso en nuestro catálogo. Si quieres, te paso con una persona del equipo.',
        intent: 'out_of_scope',
        mentionedProducts: [],
        leadInterest: null,
      };
    }
    return Promise.resolve({ output, usage: { inputTokens: 0, outputTokens: 0 } });
  }
}

export class ScriptedProvider implements ModelProvider {
  readonly name = 'scripted';
  readonly requests: ModelRequest[] = [];
  #index = 0;

  constructor(private readonly outputs: unknown[]) {}

  complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const output = this.outputs[Math.min(this.#index++, this.outputs.length - 1)];
    return Promise.resolve({ output, usage: { inputTokens: 120, outputTokens: 40 } });
  }
}

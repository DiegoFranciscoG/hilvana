/**
 * Catálogo y búsqueda. Los embeddings locales son "feature hashing" de palabras y trigramas en
 * 384 dimensiones: deterministas, sin descargar modelos ni llamar a terceros (local primero).
 * Un proveedor externo de embeddings de 384 dimensiones puede reemplazarlos sin migrar la tabla.
 */

export const EMBEDDING_DIMENSIONS = 384;
export const LOCAL_EMBEDDING_MODEL = 'hilvana-hash-384-v1';

export interface KnowledgeItem {
  id: string;
  source: 'catalog' | 'faq' | 'policy';
  title: string;
  content: string;
  price?: number | null;
  currency?: string | null;
  stock?: number | null;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'y',
  'o',
  'a',
  'en',
  'que',
  'por',
  'para',
  'con',
  'me',
  'mi',
  'tu',
  'su',
  'es',
  'son',
  'hay',
  'tienen',
  'tiene',
  'cuanto',
  'cuesta',
  'precio',
  'vale',
  'hola',
  'buenas',
  'quiero',
  'quisiera',
  'favor',
  'se',
  'lo',
  'al',
  'the',
  'and',
  'of',
]);

export function tokens(text: string): string[] {
  return normalizeText(text).split(' ').filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function embed(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const add = (feature: string, weight: number) => {
    const h = fnv1a(feature);
    vector[h % EMBEDDING_DIMENSIONS] += (h & 0x80000000 ? -1 : 1) * weight;
  };
  for (const token of tokens(text)) {
    add(`w:${token}`, 1);
    const padded = `^${token}$`;
    for (let i = 0; i + 3 <= padded.length; i++) add(`t:${padded.slice(i, i + 3)}`, 0.5);
  }
  const norm = Math.hypot(...vector);
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export interface Retriever {
  search(query: string, k: number): Promise<KnowledgeItem[]>;
  titles(): Promise<string[]>;
}

/** Búsqueda en memoria (pruebas, vista previa del configurador y demo sin base). */
export class MemoryRetriever implements Retriever {
  readonly #items: { item: KnowledgeItem; vector: number[]; words: Set<string> }[];

  constructor(items: KnowledgeItem[]) {
    this.#items = items.map((item) => ({
      item,
      vector: embed(`${item.title} ${item.content}`),
      words: new Set(tokens(`${item.title} ${item.content}`)),
    }));
  }

  search(query: string, k: number): Promise<KnowledgeItem[]> {
    const q = embed(query);
    const qWords = tokens(query);
    const scored = this.#items.map(({ item, vector, words }) => {
      const overlap = qWords.length ? qWords.filter((w) => words.has(w)).length / qWords.length : 0;
      return { item, score: 0.6 * cosine(q, vector) + 0.4 * overlap };
    });
    return Promise.resolve(
      scored.filter((s) => s.score > 0.15).sort((a, b) => b.score - a.score).slice(0, k).map((s) => s.item),
    );
  }

  titles(): Promise<string[]> {
    return Promise.resolve(this.#items.filter((i) => i.item.source === 'catalog').map((i) => i.item.title));
  }
}

/** Catálogo en Postgres: búsqueda híbrida (pgvector + texto completo) y altas con embedding local. */
import { embed, type KnowledgeItem, LOCAL_EMBEDDING_MODEL, type Retriever } from '../../../agent/src/knowledge.ts';
import { type Sql, type Tx, vectorLiteral, withWorkspace } from '../db.ts';

type Row = {
  id: string;
  source: KnowledgeItem['source'];
  title: string;
  content: string;
  price: string | null;
  currency: string | null;
  stock: number | null;
};

function toItem(row: Row): KnowledgeItem {
  return { ...row, price: row.price === null ? null : Number(row.price) };
}

export class PgRetriever implements Retriever {
  constructor(private readonly sql: Sql, private readonly workspaceId: string) {}

  search(query: string, k: number): Promise<KnowledgeItem[]> {
    const vector = vectorLiteral(embed(query));
    return withWorkspace(this.sql, this.workspaceId, async (tx) => {
      const rows = await tx<Row[]>`
        select id, source, title, content, price, currency, stock
        from (
          select id, source, title, content, price, currency, stock,
                 0.6 * coalesce(1 - (embedding operator(extensions.<=>) ${vector}::extensions.vector), 0)
               + 0.4 * least(ts_rank(fts, plainto_tsquery('spanish', ${query})) * 10, 1) as score
          from public.knowledge_chunk
        ) ranked
        where score > 0.15
        order by score desc
        limit ${k}`;
      return rows.map(toItem);
    });
  }

  titles(): Promise<string[]> {
    return withWorkspace(this.sql, this.workspaceId, async (tx) => {
      const rows = await tx<{ title: string }[]>`select title from public.knowledge_chunk where source = 'catalog'`;
      return rows.map((r) => r.title);
    });
  }
}

export interface ChunkInput {
  source: KnowledgeItem['source'];
  externalRef: string;
  title: string;
  content: string;
  price?: number;
  currency?: string;
  stock?: number;
}

export async function upsertChunk(tx: Tx, workspaceId: string, chunk: ChunkInput): Promise<void> {
  const vector = vectorLiteral(embed(`${chunk.title} ${chunk.content}`));
  const hasPrice = typeof chunk.price === 'number' && chunk.currency;
  await tx`
    insert into public.knowledge_chunk
      (workspace_id, source, external_ref, title, content, price, currency, stock, embedding, embedding_model)
    values (${workspaceId}, ${chunk.source}, ${chunk.externalRef}, ${chunk.title.slice(0, 200)}, ${
    chunk.content.slice(0, 4000)
  },
            ${hasPrice ? chunk.price! : null}, ${hasPrice ? chunk.currency! : null}, ${chunk.stock ?? null},
            ${vector}::extensions.vector, ${LOCAL_EMBEDDING_MODEL})
    on conflict (workspace_id, source, external_ref) where external_ref is not null do update set
      title = excluded.title, content = excluded.content, price = excluded.price, currency = excluded.currency,
      stock = excluded.stock, embedding = excluded.embedding, embedding_model = excluded.embedding_model`;
}

/** Completa embeddings de fragmentos cargados a mano desde la app (sin embedding). */
export async function fillMissingEmbeddings(tx: Tx, limit = 50): Promise<number> {
  const rows = await tx<{ id: string; title: string; content: string }[]>`
    select id, title, content from public.knowledge_chunk where embedding is null limit ${limit}`;
  for (const row of rows) {
    await tx`update public.knowledge_chunk
      set embedding = ${vectorLiteral(embed(`${row.title} ${row.content}`))}::extensions.vector,
          embedding_model = ${LOCAL_EMBEDDING_MODEL}
      where id = ${row.id}`;
  }
  return rows.length;
}

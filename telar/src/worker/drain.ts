/**
 * Trabajador: recorre por turnos los espacios con mensajes pendientes. Cada espacio consume solo su
 * cubeta de tokens (mensajes por minuto de su plan); lo que excede se pospone en su propia cola, así
 * un espacio saturado no frena a los demás (T-10). Un mensaje que falla se reintenta al vencer su
 * ventana de visibilidad y, tras varios intentos, se descarta con registro de auditoría.
 */
import type { QueuedWebhook } from '../../../sdk/ts/envelope.ts';
import type { LabConfig } from '../../../lab/src/anonymize.ts';
import type { TelarConfig } from '../config.ts';
import { type Sql, withWorkspace } from '../db.ts';
import type { Logger } from '../log.ts';
import { fillMissingEmbeddings } from '../pg/knowledge.ts';
import type { Drainer } from '../ports.ts';
import { processWebhook, type ReplyTask } from './process.ts';
import type { Replier } from './reply.ts';

export interface DrainOptions {
  batchSize: number;
  visibilitySeconds: number;
  deferSeconds: number;
  maxAttempts: number;
  concurrency: number;
}

export const DEFAULT_DRAIN: DrainOptions = {
  batchSize: 20,
  visibilitySeconds: 60,
  deferSeconds: 20,
  maxAttempts: 5,
  concurrency: 4,
};

export class WorkspaceDrainer implements Drainer {
  #cursor = 0;

  constructor(
    private readonly sql: Sql,
    private readonly deps: {
      config: Pick<TelarConfig, 'labCapture' | 'policies'>;
      labConfig: LabConfig;
      logger: Logger;
      replier: Replier;
      options?: Partial<DrainOptions>;
    },
  ) {}

  get options(): DrainOptions {
    return { ...DEFAULT_DRAIN, ...this.deps.options };
  }

  async pendingWorkspaces(): Promise<string[]> {
    const rows = await this.sql<{ id: string }[]>`select id from private.telar_pending_workspaces() as id`;
    return rows.map((r) => r.id);
  }

  async drainOnce(onlyWorkspace?: string): Promise<{ processed: number; deferred: number; workspaces: number }> {
    const pending = onlyWorkspace ? [onlyWorkspace] : await this.pendingWorkspaces();
    if (pending.length === 0) return { processed: 0, deferred: 0, workspaces: 0 };
    // Turno rotativo: el primero de esta vuelta pasa al final en la siguiente.
    const start = this.#cursor % pending.length;
    const ordered = [...pending.slice(start), ...pending.slice(0, start)];
    this.#cursor++;

    let processed = 0;
    let deferred = 0;
    const queue = [...ordered];
    const workers = Array.from({ length: Math.min(this.options.concurrency, queue.length) }, async () => {
      while (queue.length) {
        const workspaceId = queue.shift()!;
        try {
          const result = await this.drainWorkspace(workspaceId);
          processed += result.processed;
          deferred += result.deferred;
        } catch (error) {
          this.deps.logger.error('drain_workspace_failed', { workspaceId, error });
        }
      }
    });
    await Promise.all(workers);
    return { processed, deferred, workspaces: ordered.length };
  }

  async drainWorkspace(workspaceId: string): Promise<{ processed: number; deferred: number; replies: string[] }> {
    const { batchSize, visibilitySeconds, deferSeconds, maxAttempts } = this.options;
    const tasks: ReplyTask[] = [];
    let processed = 0;
    let deferred = 0;

    await withWorkspace(this.sql, workspaceId, async (tx) => {
      const messages = await tx<{ msg_id: string; read_ct: number; message: QueuedWebhook }[]>`
        select msg_id, read_ct, message from private.telar_read(${batchSize}, ${visibilitySeconds})`;
      let limited = false;
      for (const item of messages) {
        if (limited || !(await tx<{ ok: boolean }[]>`select private.telar_take_tokens(1) as ok`)[0].ok) {
          limited = true;
          await tx`select private.telar_defer(${item.msg_id}::bigint, ${deferSeconds})`;
          deferred++;
          continue;
        }
        try {
          const found = await tx.savepoint((sp) =>
            processWebhook(sp, {
              workspaceId,
              config: this.deps.config,
              labConfig: this.deps.labConfig,
              logger: this.deps.logger,
            }, item.message)
          );
          tasks.push(...found);
          await tx`select private.telar_ack(${item.msg_id}::bigint)`;
          processed++;
        } catch (error) {
          this.deps.logger.error('webhook_processing_failed', { workspaceId, attempt: item.read_ct, error });
          if (item.read_ct >= maxAttempts) {
            await tx`select private.telar_ack(${item.msg_id}::bigint)`;
            await tx`insert into public.audit_log (workspace_id, actor_kind, action, entity, details)
              values (${workspaceId}, 'service', 'event', 'webhook_dropped', ${tx.json({ attempts: item.read_ct })})`;
          }
        }
      }
    });

    const replies: string[] = [];
    for (const task of tasks) {
      try {
        replies.push(await this.deps.replier.agentReply(workspaceId, task));
      } catch (error) {
        this.deps.logger.error('agent_reply_failed', { workspaceId, error });
      }
    }
    return { processed, deferred, replies };
  }

  /** Mantenimiento: embeddings faltantes y retención de mensajes (LOPDP art. 15.4). */
  async maintenance(): Promise<void> {
    const workspaces = await this.sql<{ id: string }[]>`select id from private.telar_workspaces() as id`;
    for (const { id } of workspaces) {
      try {
        await withWorkspace(this.sql, id, async (tx) => {
          await fillMissingEmbeddings(tx);
          await tx`select private.telar_purge_expired()`;
        });
      } catch (error) {
        this.deps.logger.warn('maintenance_failed', { workspaceId: id, error });
      }
    }
  }
}

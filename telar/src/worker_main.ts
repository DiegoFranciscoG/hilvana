/** Trabajador local: drena las colas en bucle y hace mantenimiento cada cierto tiempo. */
import { buildRuntime } from './runtime.ts';

const runtime = await buildRuntime();
let running = true;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  try {
    Deno.addSignalListener(signal, () => (running = false));
  } catch {
    // Windows no admite SIGTERM.
  }
}

const idleMs = Number(Deno.env.get('WORKER_IDLE_MS') ?? '1000');
const maintenanceEveryMs = 10 * 60_000;
let lastMaintenance = 0;
runtime.logger.info('worker_started', {});

while (running) {
  try {
    const result = await runtime.drainer.drainOnce();
    if (result.processed > 0 || result.deferred > 0) runtime.logger.info('drained', result);
    if (Date.now() - lastMaintenance > maintenanceEveryMs) {
      await runtime.drainer.maintenance();
      lastMaintenance = Date.now();
    }
    if (result.processed === 0) await new Promise((resolve) => setTimeout(resolve, idleMs));
  } catch (error) {
    runtime.logger.error('worker_loop_failed', { error });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}
await runtime.sql.end({ timeout: 5 });

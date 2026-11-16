/** Servidor HTTP del Telar. */
import { buildRuntime } from './runtime.ts';

const runtime = await buildRuntime();
const controller = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  try {
    Deno.addSignalListener(signal, () => controller.abort());
  } catch {
    // Windows no admite SIGTERM; en contenedores Linux sí.
  }
}

const server = Deno.serve(
  { port: runtime.config.port, hostname: '0.0.0.0', signal: controller.signal, onListen: () => runtime.logger.info('telar_listening', { port: runtime.config.port }) },
  runtime.app.fetch,
);
await server.finished;
await runtime.sql.end({ timeout: 5 });

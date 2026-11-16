/** Arma las dependencias reales del Telar (servidor y trabajador comparten esta composición). */
import { loadConfiguratorConfig } from '../../agent/src/configurator.ts';
import { loadGuardrails } from '../../agent/src/guardrails.ts';
import { loadLabConfig } from '../../lab/src/anonymize.ts';
import { loadConfig, type TelarConfig } from './config.ts';
import { connect, type Sql } from './db.ts';
import { createApp } from './http/app.ts';
import { JwtVerifier } from './jwt.ts';
import { createLogger, type Logger } from './log.ts';
import { PgApi } from './pg/api.ts';
import { PgIngest } from './pg/ingest.ts';
import { FcmNotifier } from './push.ts';
import { WorkspaceDrainer } from './worker/drain.ts';
import { Replier } from './worker/reply.ts';
import { createSender } from './worker/send.ts';

export interface Runtime {
  config: TelarConfig;
  sql: Sql;
  logger: Logger;
  drainer: WorkspaceDrainer;
  app: ReturnType<typeof createApp>;
}

export async function buildRuntime(env = Deno.env): Promise<Runtime> {
  const config = await loadConfig(env);
  const logger = createLogger(config.logLevel);
  const sql = connect(config.db);
  const guardrails = await loadGuardrails();
  const notifier = config.fcm ? new FcmNotifier(config.fcm.projectId, config.fcm.serviceAccountB64, logger) : undefined;
  const replier = new Replier({ sql, config, guardrails, sender: createSender(config.meta), logger, notifier });
  const drainer = new WorkspaceDrainer(sql, { config, labConfig: await loadLabConfig(), logger, replier });
  const verifier = new JwtVerifier({ supabaseUrl: config.supabaseUrl, jwtSecret: config.supabaseJwtSecret });
  const app = createApp({
    ingest: new PgIngest(sql),
    api: new PgApi(sql, { config, replier, guardrails }),
    drainer,
    verifyUser: (token) => verifier.verify(token),
    logger,
    allowedOrigins: config.allowedOrigins,
    drainToken: config.drainToken,
    maxWebhookBytes: config.meta.webhookMaxBodyBytes,
    configurator: await loadConfiguratorConfig(),
  });
  return { config, sql, logger, drainer, app };
}

/**
 * Servidor MCP de Hilvana para agentes de IA de desarrollo (transporte stdio).
 * Herramientas de solo lectura por defecto; crear espacios exige --allow-write. Ninguna herramienta
 * recibe ni devuelve secretos: conectar canales se hace en la terminal con `hilvana connect` (stdin).
 * OWASP LLM06 (agencia excesiva): superficie mínima y explícita.
 */
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { deployPlan, renderPlan, validateDeployOptions } from '../../cli/src/deploy.ts';
import { contractAlerts, createWorkspace, listContracts, listWorkspaces } from '../../cli/src/local.ts';
import { denoRunner, type Runner } from '../../cli/src/runner.ts';

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

export function createServer(deps: { run: Runner; allowWrite: boolean }): McpServer {
  const server = new McpServer({ name: 'hilvana', version: '0.1.0' });

  server.registerTool('list_workspaces', {
    title: 'Espacios de trabajo',
    description:
      'Lista los espacios (negocios) de la instalación local con sus canales. No devuelve secretos ni datos de clientes.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => {
    const rows = await listWorkspaces(deps.run);
    return text(rows.map((w) => ({
      slug: w.slug,
      name: w.name,
      country: w.country_code,
      plan: w.plan_code,
      channels: (w.channels ?? []).map((c) => `${c.type}:${c.status}`),
      credentials: (w.credentials ?? []).map((c) => ({ id: c.id, provider: c.provider, status: c.status })),
    })));
  });

  server.registerTool('list_contracts', {
    title: 'Contratos de webhooks',
    description: 'Contratos inferidos por el laboratorio (tipo de evento, versión, muestras y alertas abiertas).',
    inputSchema: z.object({ space: z.string().regex(/^[a-z0-9-]{3,40}$/).optional() }),
    annotations: { readOnlyHint: true },
  }, async ({ space }: { space?: string }) => text(await listContracts(deps.run, space)));

  server.registerTool('drift_alerts', {
    title: 'Alertas de deriva',
    description: 'Cambios detectados en la forma de los webhooks que todavía nadie revisó, con su diff legible.',
    inputSchema: z.object({ space: z.string().regex(/^[a-z0-9-]{3,40}$/).optional() }),
    annotations: { readOnlyHint: true },
  }, async ({ space }: { space?: string }) => text(await contractAlerts(deps.run, space)));

  server.registerTool(
    'deploy_plan',
    {
      title: 'Plan de despliegue en Google Cloud',
      description: 'Devuelve los comandos de gcloud que ejecutaría `hilvana deploy`. No ejecuta nada.',
      inputSchema: z.object({
        project: z.string(),
        region: z.string(),
        supabaseUrl: z.string(),
        dbHost: z.string(),
        tag: z.string().default('v1'),
      }),
      annotations: { readOnlyHint: true },
    },
    (
      { project, region, supabaseUrl, dbHost, tag }: {
        project: string;
        region: string;
        supabaseUrl: string;
        dbHost: string;
        tag: string;
      },
    ) => {
      const options = { project, region, supabaseUrl, dbHost, tag };
      const problems = validateDeployOptions(options);
      return Promise.resolve(
        text(problems.length ? `Datos inválidos: ${problems.join('; ')}` : renderPlan(deployPlan(options))),
      );
    },
  );

  server.registerTool('connect_instructions', {
    title: 'Cómo conectar un canal',
    description:
      'Explica cómo conectar Meta, Shopify o un proveedor de IA. Los secretos nunca pasan por el chat ni por esta herramienta.',
    inputSchema: z.object({
      provider: z.enum(['meta', 'shopify', 'ai']),
      space: z.string().regex(/^[a-z0-9-]{3,40}$/),
    }),
    annotations: { readOnlyHint: true },
  }, ({ provider, space }: { provider: 'meta' | 'shopify' | 'ai'; space: string }) => {
    const fields =
      { meta: 'appSecret, accessToken, verifyToken', shopify: 'clientSecret, accessToken', ai: 'apiKey' }[provider];
    return Promise.resolve(text([
      `Pide a la persona que ejecute en SU terminal (no pegues secretos en el chat):`,
      `  hilvana connect ${provider} --space ${space} --label "<nombre>" < secreto.json`,
      `donde secreto.json tiene: ${fields}. Luego borra el archivo.`,
    ].join('\n')));
  });

  if (deps.allowWrite) {
    server.registerTool('create_workspace', {
      title: 'Crear espacio',
      description: 'Crea un espacio (negocio) en la instalación local.',
      inputSchema: z.object({
        name: z.string().min(2).max(120),
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
        country: z.string().regex(/^[A-Z]{2}$/),
        plan: z.enum(['local', 'starter', 'pro']).default('starter'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    }, async (input: { name: string; slug: string; country: string; plan: string }) => {
      const [row] = await createWorkspace(deps.run, input);
      return text({ created: input.slug, id: row?.id });
    });
  }
  return server;
}

if (import.meta.main) {
  const server = createServer({ run: denoRunner, allowWrite: Deno.args.includes('--allow-write') });
  await server.connect(new StdioServerTransport());
}

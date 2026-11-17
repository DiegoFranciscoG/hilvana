import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { InMemoryTransport, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/server';
import { createServer } from './server.ts';
import type { Runner } from '../../cli/src/runner.ts';

async function session(allowWrite: boolean, psqlStdout = '[]') {
  const calls: string[][] = [];
  const run: Runner = (command) => {
    calls.push(command);
    return Promise.resolve({ code: 0, stdout: psqlStdout, stderr: '' });
  };
  const server = createServer({ run, allowWrite });
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (value: Record<string, unknown>) => void>();
  client.onmessage = (message: unknown) => {
    const m = message as { id?: number; result?: Record<string, unknown>; error?: Record<string, unknown> };
    if (typeof m.id === 'number') pending.get(m.id)?.(m.result ?? { error: m.error });
  };
  await server.connect(serverSide);
  await client.start();
  let id = 0;
  const request = (method: string, params: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve) => {
      pending.set(++id, resolve);
      client.send({ jsonrpc: '2.0', id, method, params } as never);
    });
  await request('initialize', {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'prueba', version: '1' },
  });
  await client.send({ jsonrpc: '2.0', method: 'notifications/initialized' } as never);
  return { request, calls, close: () => server.close() };
}

Deno.test('MCP: por defecto solo herramientas de lectura', async () => {
  const s = await session(false);
  const { tools } = await s.request('tools/list', {}) as {
    tools: { name: string; annotations?: { readOnlyHint?: boolean } }[];
  };
  assertEquals(tools.map((t) => t.name).sort(), [
    'connect_instructions',
    'deploy_plan',
    'drift_alerts',
    'list_contracts',
    'list_workspaces',
  ]);
  assert(tools.every((t) => t.annotations?.readOnlyHint === true));
  await s.close();
});

Deno.test('MCP: con --allow-write aparece create_workspace', async () => {
  const s = await session(true, '[{"id":"11111111-1111-4111-8111-111111111111"}]');
  const { tools } = await s.request('tools/list', {}) as { tools: { name: string }[] };
  assert(tools.some((t) => t.name === 'create_workspace'));
  const result = await s.request('tools/call', {
    name: 'create_workspace',
    arguments: { name: 'Vivero', slug: 'vivero', country: 'EC' },
  });
  assertStringIncludes(JSON.stringify(result), 'vivero');
  await s.close();
});

Deno.test('MCP: list_workspaces no expone secretos y deploy_plan no ejecuta nada', async () => {
  const row = [{
    slug: 'panaderia',
    name: 'Panadería',
    country_code: 'EC',
    plan_code: 'starter',
    credentials: [{ id: 'c1', provider: 'meta', label: 'x', status: 'active' }],
    channels: [{ type: 'whatsapp', external_id: '1', status: 'active' }],
  }];
  const s = await session(false, JSON.stringify(row));
  const listed = JSON.stringify(await s.request('tools/call', { name: 'list_workspaces', arguments: {} }));
  assertStringIncludes(listed, 'panaderia');
  assert(!listed.includes('external_id'));
  const before = s.calls.length;
  const plan = JSON.stringify(
    await s.request('tools/call', {
      name: 'deploy_plan',
      arguments: {
        project: 'hilvana-demo-123',
        region: 'us-central1',
        supabaseUrl: 'https://abc.supabase.co',
        dbHost: 'db.abc.supabase.co',
      },
    }),
  );
  assertStringIncludes(plan, 'gcloud run deploy');
  assertEquals(s.calls.length, before, 'deploy_plan no ejecuta comandos');
  const howTo = JSON.stringify(
    await s.request('tools/call', {
      name: 'connect_instructions',
      arguments: { provider: 'meta', space: 'panaderia' },
    }),
  );
  assertStringIncludes(howTo, 'no pegues secretos en el chat');
  await s.close();
});

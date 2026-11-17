import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { runEval } from '../evals/run.ts';
import { checkOutput, extractAmounts, loadGuardrails } from '@hilvana/agent/guardrails.ts';
import { MemoryRetriever } from '@hilvana/agent/knowledge.ts';
import { CatalogResponder, ScriptedProvider } from '@hilvana/agent/providers/local.ts';
import { OpenAICompatibleProvider } from '@hilvana/agent/providers/openai_compatible.ts';
import { respond } from '@hilvana/agent/runtime.ts';
import { validateSpec } from '@hilvana/agent/spec.ts';

const evalData = JSON.parse(await Deno.readTextFile(new URL('../evals/conversations.json', import.meta.url)));
const spec = (() => {
  const v = validateSpec(evalData.spec);
  if (!v.ok) throw new Error(v.issues.join(';'));
  return v.spec;
})();
const guardrails = await loadGuardrails();

Deno.test('T-06 en 50 conversaciones no hay precios ni productos inventados y se resiste la inyección', async () => {
  const results = await runEval();
  assertEquals(results.length, 50);
  const failed = results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.problems.join('; ')}`);
  assertEquals(failed, []);
  const injections = results.filter((r) => r.category.startsWith('inyeccion'));
  assertEquals(injections.length, 10);
  // Las salidas adversarias del modelo nunca llegan al cliente.
  assert(results.filter((r) => r.category === 'precio-inventado').every((r) => r.decision.action === 'handoff'));
});

Deno.test('montos con moneda, en palabras y con verbos de precio', () => {
  assertEquals(extractAmounts('Cuesta $3.50, o 2,75 dólares, USD 4 y S/ 10.20; vale 1.25'), [3.5, 4, 10.2, 2.75, 1.25]);
  assertEquals(extractAmounts('Abrimos de 08:00 a 13:00 y tenemos 2 docenas'), []);
});

Deno.test('la primera respuesta se presenta como asistente automático', async () => {
  const decision = await respond({
    spec,
    inbound: '¿Cuánto cuesta la docena de pan de yuca?',
    history: [],
    agentTurns: 0,
    isFirstReply: true,
    now: new Date('2026-11-16T15:00:00Z'),
    retriever: new MemoryRetriever(evalData.catalog),
    provider: new CatalogResponder(),
    guardrails,
  });
  assertEquals(decision.action, 'reply');
  assertStringIncludes(decision.text, 'asistente automático');
  assertStringIncludes(decision.text, '$3.50');
});

Deno.test('sin presupuesto de IA o con error del proveedor se deriva a una persona', async () => {
  const base = {
    spec,
    inbound: 'hola',
    history: [],
    agentTurns: 0,
    isFirstReply: false,
    now: new Date('2026-11-16T15:00:00Z'),
    retriever: new MemoryRetriever(evalData.catalog),
    guardrails,
  };
  const noBudget = await respond({ ...base, provider: new CatalogResponder(), tokensLeft: 0 });
  assertEquals(noBudget.action === 'handoff' && noBudget.reason, 'limit_reached');
  const broken = await respond({
    ...base,
    provider: { name: 'x', complete: () => Promise.reject(new Error('caído')) },
  });
  assertEquals(broken.action === 'handoff' && broken.reason, 'error');
  const invalid = await respond({ ...base, provider: new ScriptedProvider([{ texto: 'sin formato' }]) });
  assertEquals(invalid.action === 'handoff' && invalid.reason, 'error');
  const tooMany = await respond({ ...base, agentTurns: spec.handoff.maxAgentTurns, provider: new CatalogResponder() });
  assertEquals(tooMany.action === 'handoff' && tooMany.reason, 'low_confidence');
});

Deno.test('la salida con HTML o demasiado larga no sale', () => {
  const context = { retrieved: [], catalogTitles: [], systemPrompt: 'reglas', maxChars: 50, allowPrices: true };
  assert(!checkOutput({ reply: '<b>hola</b>', intent: 'answer', mentionedProducts: [] }, context, guardrails).ok);
  assert(!checkOutput({ reply: 'x'.repeat(51), intent: 'answer', mentionedProducts: [] }, context, guardrails).ok);
  assert(
    checkOutput({ reply: 'Hola, ¿en qué te ayudo?', intent: 'answer', mentionedProducts: [] }, context, guardrails).ok,
  );
});

Deno.test('proveedor compatible: pide salida estructurada, exige https fuera de local y lee el uso', async () => {
  let body: Record<string, unknown> = {};
  const provider = new OpenAICompatibleProvider({
    baseUrl: 'http://localhost:11434/v1',
    model: 'modelo-local',
    fetch: (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Promise.resolve(Response.json({
        choices: [{
          message: {
            content: JSON.stringify({ reply: 'Hola', intent: 'answer', mentionedProducts: [], leadInterest: null }),
          },
        }],
        usage: { prompt_tokens: 50, completion_tokens: 7 },
      }));
    },
  });
  const response = await provider.complete({
    system: 's',
    messages: [{ role: 'user', content: 'u' }],
    maxOutputTokens: 100,
  });
  assertEquals((body.response_format as { type: string }).type, 'json_schema');
  assertEquals(response.usage, { inputTokens: 50, outputTokens: 7 });
  let threw = false;
  try {
    new OpenAICompatibleProvider({ baseUrl: 'http://modelos.example.com/v1', model: 'm' });
  } catch {
    threw = true;
  }
  assert(threw, 'un endpoint remoto sin https se rechaza');
});

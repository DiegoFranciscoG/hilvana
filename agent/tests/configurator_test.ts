import { assert, assertEquals } from '@std/assert';
import {
  answerInterview,
  type InterviewTurn,
  loadConfiguratorConfig,
  parseHours,
  startInterview,
} from '@hilvana/agent/configurator.ts';
import { specJsonSchema, validateSpec } from '@hilvana/agent/spec.ts';

const config = await loadConfiguratorConfig();

function interview(answers: string[]): { turns: InterviewTurn[]; last: InterviewTurn } {
  const turns: InterviewTurn[] = [startInterview(config)];
  for (const answer of answers) {
    const current = turns[turns.length - 1];
    if (current.done) break;
    turns.push(answerInterview(config, current.state, answer));
  }
  return { turns, last: turns[turns.length - 1] };
}

Deno.test('T-05 una entrevista simulada produce una especificación válida', () => {
  const { last } = interview([
    'Panadería La Espiga',
    'panadería',
    'Ecuador',
    'listo',
    'cercano',
    'lunes a viernes 07:00-19:00, sábado 08:00-13:00',
    'Sí, en Cuenca con costo según la zona',
    'Efectivo y transferencia',
    'A mano',
    'sí',
    'persona, asesor, humano',
    'sí',
  ]);
  assert(last.done && 'spec' in last, `la entrevista no terminó en una especificación: ${JSON.stringify(last)}`);
  const spec = last.spec;
  assertEquals(spec.business.name, 'Panadería La Espiga');
  assertEquals(spec.business.country, 'EC');
  assertEquals(spec.business.currency, 'USD');
  assertEquals(spec.business.timezone, 'America/Guayaquil');
  assertEquals(spec.assistant.displayName, 'Asistente de Panadería La Espiga');
  assert(/autom[aá]tic/.test(spec.assistant.disclosure), 'la presentación dice que es automático');
  assertEquals(spec.hours.weekly.length, 6);
  assertEquals(spec.hours.weekly[0], { day: 'mon', open: '07:00', close: '19:00' });
  assertEquals(spec.hours.weekly[5], { day: 'sat', open: '08:00', close: '13:00' });
  assertEquals(spec.policies.map((p) => p.topic), ['entregas', 'pagos']);
  assertEquals(spec.catalog, { source: 'manual', allowPriceQuotes: true });
  assertEquals(spec.handoff.keywords, ['persona', 'asesor', 'humano']);
  assertEquals(validateSpec(spec).ok, true);
});

Deno.test('T-05 respuestas inválidas repiten la pregunta con una ayuda, sin avanzar', () => {
  const start = startInterview(config);
  const first = answerInterview(config, start.state, 'Óptica Visión Clara');
  assert(!first.done);
  const second = answerInterview(config, first.state, 'óptica');
  assert(!second.done);
  const wrong = answerInterview(config, second.state, 'Atlántida');
  assert(!wrong.done && wrong.error?.includes('No reconocí el país'));
  assertEquals(wrong.state.step, second.state.step);
  const right = answerInterview(config, wrong.state, 'Perú');
  assert(!right.done);
  assertEquals(right.state.answers.country, 'PE');
});

Deno.test('T-05 una entrevista de Perú usa soles y la zona horaria de Lima', () => {
  const { last } = interview([
    'Ferretería del Sur',
    'ferretería',
    'Perú',
    'Ferre',
    'formal',
    'lun-vie 8 a 18',
    'no',
    'Yape y efectivo',
    'shopify',
    'no',
    'listo',
    'no',
  ]);
  assert(last.done && 'spec' in last);
  assertEquals([last.spec.business.currency, last.spec.business.timezone], ['PEN', 'America/Lima']);
  assertEquals(last.spec.assistant.tone, 'formal');
  assertEquals(last.spec.catalog, { source: 'shopify', allowPriceQuotes: false });
  assertEquals(last.spec.policies.map((p) => p.topic), ['pagos']);
  assertEquals(last.spec.hours.weekly.map((s) => s.day), ['mon', 'tue', 'wed', 'thu', 'fri']);
  assertEquals(last.spec.leads.capture, false);
});

Deno.test('horarios: rangos, días sueltos y todos los días', () => {
  assertEquals(parseHours('todos los días 09:00 a 21:30', config)?.length, 7);
  assertEquals(parseHours('sábado y domingo 10:00-14:00', config)?.map((s) => s.day), ['sat', 'sun']);
  assertEquals(parseHours('lunes 18:00-08:00', config), null, 'abrir después de cerrar no es válido');
  assertEquals(parseHours('cuando puedo', config), null);
});

Deno.test('la especificación rechaza un asistente que no se identifica como automático', () => {
  const { last } = interview([
    'Panadería La Espiga',
    'panadería',
    'Ecuador',
    'listo',
    'cercano',
    'lunes 08:00-12:00',
    'no',
    'efectivo',
    'manual',
    'sí',
    'listo',
    'sí',
  ]);
  assert(last.done && 'spec' in last);
  const hidden = { ...last.spec, assistant: { ...last.spec.assistant, disclosure: 'Hola, soy Ana de la panadería.' } };
  const result = validateSpec(hidden);
  assert(!result.ok && result.issues.some((i) => i.startsWith('assistant.disclosure')));
  const schema = specJsonSchema() as { type: string; properties: Record<string, unknown> };
  assertEquals(schema.type, 'object');
  assert('handoff' in schema.properties);
});

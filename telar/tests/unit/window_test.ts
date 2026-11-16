import { assertEquals } from '@std/assert';
import { type ChannelPolicies, decideSend, windowDeadlines } from '@hilvana/connectors/mod.ts';

const policies: ChannelPolicies = JSON.parse(
  await Deno.readTextFile(new URL('../../config/channel-policies.json', import.meta.url)),
);
const now = new Date('2026-11-16T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

Deno.test('T-07 WhatsApp: dentro de 24 h el agente responde con texto libre', () => {
  const decision = decideSend(policies, {
    channel: 'whatsapp',
    author: 'agent',
    contentKind: 'text',
    lastInboundAt: hoursAgo(23.9),
    now,
    humanAgentApproved: false,
  });
  assertEquals([decision.allowed, decision.mode], [true, 'free_text']);
});

Deno.test('T-07 WhatsApp: fuera de 24 h no se envía texto libre, ni del agente ni de una persona', () => {
  for (const author of ['agent', 'human'] as const) {
    const decision = decideSend(policies, {
      channel: 'whatsapp',
      author,
      contentKind: 'text',
      lastInboundAt: hoursAgo(24.01),
      now,
      humanAgentApproved: true,
    });
    assertEquals([decision.allowed, decision.mode, decision.reason], [false, 'blocked', 'window_closed']);
  }
});

Deno.test('T-07 WhatsApp: fuera de la ventana solo pasa una plantilla', () => {
  const decision = decideSend(policies, {
    channel: 'whatsapp',
    author: 'human',
    contentKind: 'template',
    lastInboundAt: hoursAgo(72),
    now,
    humanAgentApproved: false,
  });
  assertEquals([decision.allowed, decision.mode], [true, 'template']);
});

Deno.test('T-07 sin mensaje previo del cliente no hay ventana', () => {
  const decision = decideSend(policies, {
    channel: 'whatsapp',
    author: 'agent',
    contentKind: 'text',
    lastInboundAt: null,
    now,
    humanAgentApproved: false,
  });
  assertEquals(decision.allowed, false);
});

Deno.test('Messenger/Instagram: HUMAN_AGENT solo para personas, con permiso y dentro de 7 días', () => {
  for (const channel of ['messenger', 'instagram'] as const) {
    const base = { channel, contentKind: 'text' as const, now, lastInboundAt: hoursAgo(48) };
    assertEquals(decideSend(policies, { ...base, author: 'human', humanAgentApproved: true }).mode, 'human_agent_tag');
    assertEquals(decideSend(policies, { ...base, author: 'agent', humanAgentApproved: true }).allowed, false);
    assertEquals(decideSend(policies, { ...base, author: 'human', humanAgentApproved: false }).allowed, false);
    assertEquals(
      decideSend(policies, { ...base, lastInboundAt: hoursAgo(24 * 7 + 1), author: 'human', humanAgentApproved: true })
        .allowed,
      false,
    );
  }
});

Deno.test('Shopify no es un canal de mensajería', () => {
  const decision = decideSend(policies, {
    channel: 'shopify',
    author: 'agent',
    contentKind: 'text',
    lastInboundAt: hoursAgo(1),
    now,
    humanAgentApproved: false,
  });
  assertEquals([decision.allowed, decision.reason], [false, 'not_messaging']);
});

Deno.test('fechas de cierre de ventana para la bandeja', () => {
  const last = new Date('2026-11-16T00:00:00Z');
  assertEquals(windowDeadlines(policies, 'whatsapp', last), {
    serviceUntil: new Date('2026-11-17T00:00:00Z'),
    humanUntil: null,
  });
  assertEquals(windowDeadlines(policies, 'messenger', last).humanUntil, new Date('2026-11-23T00:00:00Z'));
});

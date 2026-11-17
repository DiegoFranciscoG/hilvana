/**
 * Datos de demostración FICTICIOS para el entorno local (servicio `seed` de docker compose).
 * Crea dos usuarios por la API de administración de Auth y dos negocios con catálogo, agente
 * publicado y conversaciones de ejemplo. Es idempotente: si ya existen, no hace nada.
 * Los números usan el prefijo 5930000… (no asignable a móviles reales) y los correos el dominio .test.
 */
import postgres from 'postgres';
import { embed, LOCAL_EMBEDDING_MODEL } from '../agent/src/knowledge.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta ${name}`);
  return value;
};

const authUrl = Deno.env.get('SEED_AUTH_URL') ?? 'http://auth:9999';
const serviceKey = env('SERVICE_ROLE_KEY');
const demoPassword = env('DEMO_PASSWORD');
const sql = postgres({
  host: Deno.env.get('SEED_DB_HOST') ?? 'db',
  port: 5432,
  database: 'postgres',
  username: 'postgres',
  password: env('POSTGRES_PASSWORD'),
  prepare: false,
  onnotice: () => {},
});
const evalData = JSON.parse(await Deno.readTextFile(new URL('../agent/evals/conversations.json', import.meta.url)));
const vector = (text: string) => `[${embed(text).map((v) => v.toFixed(6)).join(',')}]`;
const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');

async function waitForAuth(): Promise<void> {
  for (let i = 0; i < 90; i++) {
    try {
      const response = await fetch(`${authUrl}/health`);
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // arrancando
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Auth no respondió');
}

async function ensureUser(email: string, name: string): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`select id from auth.users where email = ${email}`;
  if (existing) return existing.id;
  const response = await fetch(`${authUrl}/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: demoPassword, email_confirm: true, user_metadata: { name } }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`no se pudo crear ${email}: ${response.status}`);
  return body.id;
}

interface Turn {
  from: 'contact' | 'agent' | 'human';
  text: string;
  minutesAgo: number;
}

async function seedWorkspace(input: {
  slug: string;
  name: string;
  industry: string;
  country: string;
  timezone: string;
  ownerId: string;
  agentId?: string;
  spec: Record<string, unknown>;
  catalog: {
    ref: string;
    source: string;
    title: string;
    content: string;
    price: number | null;
    currency: string | null;
    stock: number | null;
  }[];
  phoneNumberId: string;
  conversations: {
    contact: string;
    name: string;
    status: 'agent' | 'human' | 'closed';
    turns: Turn[];
    handoff?: string;
    lead?: string;
  }[];
}): Promise<void> {
  const [ws] = await sql<{ id: string }[]>`
    insert into public.workspace (slug, name, industry, country_code, timezone, plan_code)
    values (${input.slug}, ${input.name}, ${input.industry}, ${input.country}, ${input.timezone}, 'local') returning id`;
  await sql`insert into public.member (workspace_id, user_id, role) values (${ws.id}, ${input.ownerId}, 'owner')`;
  if (input.agentId) {
    await sql`insert into public.member (workspace_id, user_id, role) values (${ws.id}, ${input.agentId}, 'agent')`;
  }

  // Credencial de una app de Meta inexistente: secretos aleatorios que solo viven en Vault.
  const [cred] = await sql<{ id: string }[]>`
    select private.store_credential_admin(${ws.id}::uuid, 'meta', 'App de Meta de demostración',
      ${sql.json({ appSecret: randomSecret(), accessToken: randomSecret(), verifyToken: randomSecret() })}::jsonb,
      ${sql.json({ appId: '0000000000', demo: true })}::jsonb) as id`;
  const [channel] = await sql<{ id: string }[]>`
    insert into public.channel (workspace_id, credential_id, type, external_id, display_name)
    values (${ws.id}, ${cred.id}, 'whatsapp', ${input.phoneNumberId}, ${`WhatsApp de ${input.name}`}) returning id`;

  const [spec] = await sql<{ id: string }[]>`
    insert into public.agent_spec (workspace_id, version, status, spec, published_at)
    values (${ws.id}, 1, 'published', ${sql.json(input.spec)}, now()) returning id`;
  await sql`update public.workspace set active_agent_spec_id = ${spec.id} where id = ${ws.id}`;

  for (const item of input.catalog) {
    await sql`
      insert into public.knowledge_chunk (workspace_id, source, external_ref, title, content, price, currency, stock, embedding, embedding_model)
      values (${ws.id}, ${item.source}, ${item.ref}, ${item.title}, ${item.content}, ${item.price}, ${item.currency}, ${item.stock},
              ${vector(`${item.title} ${item.content}`)}::extensions.vector, ${LOCAL_EMBEDDING_MODEL})`;
  }

  for (const conv of input.conversations) {
    const [contact] = await sql<{ id: string }[]>`
      insert into public.contact (workspace_id, channel_id, external_id, display_name, last_inbound_at)
      values (${ws.id}, ${channel.id}, ${conv.contact}, ${conv.name},
              now() - make_interval(mins => ${
      Math.min(...conv.turns.filter((t) => t.from === 'contact').map((t) => t.minutesAgo))
    }))
      returning id`;
    const lastTurn = conv.turns[conv.turns.length - 1];
    const lastInbound = Math.min(...conv.turns.filter((t) => t.from === 'contact').map((t) => t.minutesAgo));
    const [conversation] = await sql<{ id: string }[]>`
      insert into public.conversation (workspace_id, channel_id, contact_id, status, assigned_to, window_expires_at,
                                       last_message_at, last_message_preview, unread_count)
      values (${ws.id}, ${channel.id}, ${contact.id}, ${conv.status}, ${
      conv.status === 'human' ? input.agentId ?? input.ownerId : null
    },
              now() - make_interval(mins => ${lastInbound}) + interval '24 hours',
              now() - make_interval(mins => ${lastTurn.minutesAgo}), ${lastTurn.text.slice(0, 160)},
              ${conv.status === 'closed' ? 0 : conv.turns.filter((t) => t.from === 'contact').length})
      returning id`;
    let previousInbound: string | null = null;
    for (const [i, turn] of conv.turns.entries()) {
      const inbound = turn.from === 'contact';
      const [message] = await sql<{ id: string }[]>`
        insert into public.message (workspace_id, conversation_id, channel_id, direction, author, sent_by, channel_message_id,
                                    in_reply_to, kind, body, status, created_at)
        values (${ws.id}, ${conversation.id}, ${channel.id}, ${inbound ? 'inbound' : 'outbound'}, ${turn.from},
                ${
        turn.from === 'human' ? input.agentId ?? input.ownerId : null
      }, ${`wamid.demo.${input.slug}.${conv.contact}.${i}`},
                ${turn.from === 'agent' ? previousInbound : null}, 'text', ${turn.text}, ${
        inbound ? 'received' : 'read'
      },
                now() - make_interval(mins => ${turn.minutesAgo}))
        returning id`;
      if (inbound) previousInbound = message.id;
    }
    if (conv.handoff) {
      await sql`insert into public.handoff (workspace_id, conversation_id, reason, created_at)
        values (${ws.id}, ${conversation.id}, ${conv.handoff}, now() - interval '20 minutes')`;
    }
    if (conv.lead) {
      await sql`insert into public.lead (workspace_id, conversation_id, contact_id, interest, status)
        values (${ws.id}, ${conversation.id}, ${contact.id}, ${conv.lead}, 'new')`;
    }
  }
  await sql`insert into public.usage_daily (workspace_id, day, messages_in, messages_out, ai_input_tokens, ai_output_tokens)
    values (${ws.id}, current_date, 14, 11, 9200, 1800) on conflict do nothing`;
}

await waitForAuth();
const [already] = await sql<
  { n: number }[]
>`select count(*)::int as n from public.workspace where slug = 'panaderia-la-espiga'`;
if (already.n > 0) {
  console.log('Datos de demo ya cargados.');
  await sql.end();
  Deno.exit(0);
}

const owner = await ensureUser('demo@hilvana.test', 'Dueña de demo');
const agent = await ensureUser('agente@hilvana.test', 'Agente de demo');

await seedWorkspace({
  slug: 'panaderia-la-espiga',
  name: 'Panadería La Espiga',
  industry: 'panadería',
  country: 'EC',
  timezone: 'America/Guayaquil',
  ownerId: owner,
  agentId: agent,
  spec: evalData.spec,
  catalog: evalData.catalog.map((c: Record<string, unknown>) => ({ ...c, ref: c.id })),
  phoneNumberId: '100000000000101',
  conversations: [
    {
      contact: '593000000101',
      name: 'Lucía A.',
      status: 'agent',
      lead: '2 docenas de pan de yuca para el sábado',
      turns: [
        { from: 'contact', text: 'Hola, ¿cuánto cuesta la docena de pan de yuca?', minutesAgo: 42 },
        {
          from: 'agent',
          text:
            'Hola, soy el asistente automático de Panadería La Espiga.\n\nPan de yuca – Docena: Docena de pan de yuca recién horneado. Cuesta $3.50. Hay 40 disponibles.',
          minutesAgo: 41,
        },
        { from: 'contact', text: 'Perfecto, quiero 2 docenas para el sábado', minutesAgo: 39 },
      ],
    },
    {
      contact: '593000000102',
      name: 'Mateo C.',
      status: 'human',
      handoff: 'requested_by_contact',
      turns: [
        { from: 'contact', text: 'Necesito una persona para un pedido grande de humitas', minutesAgo: 25 },
        { from: 'agent', text: 'Te paso con una persona del equipo.', minutesAgo: 25 },
        { from: 'human', text: '¡Hola Mateo! Soy Carla. ¿Para cuántas personas sería?', minutesAgo: 18 },
        { from: 'contact', text: 'Para 40, el viernes en la tarde', minutesAgo: 12 },
      ],
    },
    {
      contact: '593000000103',
      name: 'Sofía R.',
      status: 'agent',
      turns: [
        { from: 'contact', text: '¿Hacen entregas en Cuenca?', minutesAgo: 8 },
        {
          from: 'agent',
          text: 'Sí, entregamos en Cuenca de 9:00 a 17:00; el costo depende de la zona.',
          minutesAgo: 8,
        },
      ],
    },
    {
      contact: '593000000104',
      name: 'Andrés P.',
      status: 'closed',
      turns: [
        { from: 'contact', text: '¿Abren los domingos?', minutesAgo: 1440 },
        {
          from: 'agent',
          text: 'Los domingos no abrimos; de lunes a viernes 07:00-19:00 y sábado 08:00-13:00.',
          minutesAgo: 1439,
        },
        { from: 'contact', text: 'Gracias!', minutesAgo: 1430 },
      ],
    },
  ],
});

await seedWorkspace({
  slug: 'ferreteria-el-perno',
  name: 'Ferretería El Perno',
  industry: 'ferretería',
  country: 'PE',
  timezone: 'America/Lima',
  ownerId: owner,
  spec: {
    ...evalData.spec,
    business: {
      ...evalData.spec.business,
      name: 'Ferretería El Perno',
      industry: 'ferretería',
      country: 'PE',
      timezone: 'America/Lima',
      currency: 'PEN',
    },
    assistant: {
      ...evalData.spec.assistant,
      displayName: 'Asistente de Ferretería El Perno',
      disclosure: 'Hola, soy el asistente automático de Ferretería El Perno.',
    },
    policies: [{ topic: 'pagos', text: 'Efectivo, Yape y transferencia.' }],
  },
  catalog: [
    {
      ref: 'f1',
      source: 'catalog',
      title: 'Clavos de 2 pulgadas (kg)',
      content: 'Kilo de clavos de acero de 2 pulgadas.',
      price: 9.5,
      currency: 'PEN',
      stock: 60,
    },
    {
      ref: 'f2',
      source: 'catalog',
      title: 'Martillo de uña 16 oz',
      content: 'Martillo con mango de fibra.',
      price: 38,
      currency: 'PEN',
      stock: 15,
    },
    {
      ref: 'f3',
      source: 'catalog',
      title: 'Cinta métrica 5 m',
      content: 'Cinta métrica con freno.',
      price: 22.9,
      currency: 'PEN',
      stock: 0,
    },
  ],
  phoneNumberId: '100000000000202',
  conversations: [
    {
      contact: '510000000201',
      name: 'Valeria M.',
      status: 'agent',
      turns: [
        { from: 'contact', text: '¿Tienen cinta métrica de 5 metros?', minutesAgo: 15 },
        { from: 'agent', text: 'Cinta métrica 5 m: Cinta métrica con freno. Por ahora está agotado.', minutesAgo: 15 },
      ],
    },
  ],
});

console.log(
  'Datos de demo cargados: demo@hilvana.test y agente@hilvana.test (contraseña en HILVANA_DEMO_PASSWORD de .env).',
);
await sql.end();

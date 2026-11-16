-- T-03: un miembro de un espacio no puede leer ni escribir datos de otro (RLS),
-- probado con usuarios de auth.users y los mismos claims que emite Supabase Auth.
begin;
select plan(23);

-- Datos: Ana es dueña de "panaderia-andina", Beto de "ferreteria-sur"; Carla es agente de Ana.
do $$
begin
  perform tests.create_user('ana');
  perform tests.create_user('beto');
  perform tests.create_user('carla');
  perform tests.authenticate_as('ana');
  perform public.create_workspace('Panadería Andina', 'panaderia-andina', 'EC', 'panadería');
  perform tests.authenticate_as('beto');
  perform public.create_workspace('Ferretería del Sur', 'ferreteria-sur', 'PE', 'ferretería', 'America/Lima');
  perform tests.reset_role();
  insert into public.member (workspace_id, user_id, role)
  values (tests.workspace_id('panaderia-andina'), tests.user_id('carla'), 'agent');
end
$$;

create function pg_temp.seed(p_slug text, p_phone_id text, p_wa_id text, p_text text)
returns void language plpgsql as $$
declare
  v_ws uuid := tests.workspace_id(p_slug);
  v_cred uuid;
  v_channel uuid;
  v_contact uuid;
  v_conv uuid;
begin
  v_cred := private.store_credential_admin(v_ws, 'meta', 'App de prueba',
    jsonb_build_object('appSecret', 'app-secret-' || p_slug, 'accessToken', 'access-token-' || p_slug,
                       'verifyToken', 'verify-token-' || p_slug));
  insert into public.channel (workspace_id, credential_id, type, external_id, display_name)
  values (v_ws, v_cred, 'whatsapp', p_phone_id, 'WhatsApp ' || p_slug) returning id into v_channel;
  insert into public.contact (workspace_id, channel_id, external_id, display_name)
  values (v_ws, v_channel, p_wa_id, 'Cliente de ' || p_slug) returning id into v_contact;
  insert into public.conversation (workspace_id, channel_id, contact_id, last_message_preview)
  values (v_ws, v_channel, v_contact, p_text) returning id into v_conv;
  insert into public.message (workspace_id, conversation_id, channel_id, direction, author, channel_message_id, body, status)
  values (v_ws, v_conv, v_channel, 'inbound', 'contact', 'wamid.' || p_slug, p_text, 'received');
  insert into public.knowledge_chunk (workspace_id, source, title, content, price, currency)
  values (v_ws, 'catalog', 'Producto de ' || p_slug, 'Descripción', 2.50, 'USD');
end $$;

do $$
begin
  perform pg_temp.seed('panaderia-andina', '100000000001', '593990000001', 'Hola, ¿tienen pan de yuca?');
  perform pg_temp.seed('ferreteria-sur', '100000000002', '51990000002', 'Necesito clavos de 2 pulgadas');
end
$$;

-- Identificadores capturados como administrador (bajo RLS no serían visibles).
select tests.workspace_id('panaderia-andina') as ws_a, tests.workspace_id('ferreteria-sur') as ws_b \gset
select id as contact_a from public.contact where workspace_id = :'ws_a' \gset
select id as conv_a from public.conversation where workspace_id = :'ws_a' \gset
select id as conv_b, contact_id as contact_b from public.conversation where workspace_id = :'ws_b' \gset
select id as cred_b from public.credential where workspace_id = :'ws_b' \gset

-- 1. Cada dueño ve solo su espacio.
select tests.authenticate_as('ana') \g /dev/null
select results_eq($$ select slug from public.workspace $$, $$ values ('panaderia-andina'::text) $$,
  'Ana ve solo su espacio');
select results_eq($$ select count(*)::int from public.message $$, $$ values (1) $$,
  'Ana ve solo los mensajes de su espacio');
select results_eq($$ select count(*)::int from public.contact $$, $$ values (1) $$,
  'Ana ve solo sus contactos');
select results_eq($$ select count(*)::int from public.credential $$, $$ values (1) $$,
  'Ana (dueña) ve los metadatos de su credencial');

select tests.authenticate_as('beto') \g /dev/null
select results_eq($$ select slug from public.workspace $$, $$ values ('ferreteria-sur'::text) $$,
  'Beto ve solo su espacio');
select is_empty(format('select 1 from public.conversation where workspace_id = %L', :'ws_a'),
  'Beto no ve conversaciones de otro espacio');
select is_empty(format('select 1 from public.knowledge_chunk where workspace_id = %L', :'ws_a'),
  'Beto no ve el catálogo de otro espacio');

-- 2. Escrituras cruzadas: no tocan filas o fallan por política.
select results_eq(
  format('with u as (update public.workspace set name = %L where id = %L returning 1) select count(*)::int from u',
         'Tomado', :'ws_a'),
  $$ values (0) $$,
  'Beto no puede renombrar un espacio ajeno');
select throws_ok(
  format('insert into public.knowledge_chunk (workspace_id, source, title, content) values (%L, %L, %L, %L)',
         :'ws_a', 'faq', 'x', 'y'),
  '42501', null, 'Beto no puede insertar catálogo en un espacio ajeno');
select throws_ok(
  format('select public.store_credential(%L, %L, %L, %L::jsonb)', :'ws_a', 'meta', 'robada',
         '{"appSecret":"aaaaaaaaaa","accessToken":"bbbbbbbbbb","verifyToken":"cccccccccc"}'),
  '42501', null, 'Beto no puede guardar credenciales en un espacio ajeno');
select throws_ok(format('select public.export_contact(%L::uuid)', :'contact_a'),
  '42501', null, 'Beto no puede exportar contactos ajenos');
select throws_ok(format('select public.take_conversation(%L::uuid)', :'conv_a'),
  '42501', null, 'Beto no puede tomar conversaciones ajenas');
select throws_ok(format('select public.delete_workspace(%L::uuid)', :'ws_a'),
  '42501', null, 'Beto no puede borrar un espacio ajeno');

-- 3. Roles dentro del mismo espacio.
select tests.authenticate_as('carla') \g /dev/null
select results_eq($$ select count(*)::int from public.conversation $$, $$ values (1) $$,
  'Carla (agente) ve las conversaciones de su espacio');
select results_eq($$ select count(*)::int from public.credential $$, $$ values (0) $$,
  'Carla (agente) no ve credenciales');
select throws_ok(
  format('insert into public.knowledge_chunk (workspace_id, source, title, content) values (%L, %L, %L, %L)',
         :'ws_a', 'faq', 'x', 'y'),
  '42501', null, 'Carla (agente) no edita el catálogo');
select lives_ok(format('select public.take_conversation(%L::uuid)', :'conv_a'),
  'Carla (agente) toma una conversación de su espacio');

-- 4. Sin sesión no hay acceso.
select tests.act_as_anon() \g /dev/null
select throws_ok($$ select count(*) from public.workspace $$, '42501', null, 'anon no lee espacios');
select throws_ok($$ select count(*) from public.message $$, '42501', null, 'anon no lee mensajes');

-- 5. Rol del Telar: solo el espacio fijado en la transacción.
select tests.act_as_telar(:'ws_a') \g /dev/null
select results_eq($$ select count(*)::int from public.message $$, $$ values (1) $$,
  'El Telar con contexto ve solo los mensajes de ese espacio');
select throws_ok(
  format('insert into public.lead (workspace_id, conversation_id, contact_id, interest) values (%L, %L, %L, %L)',
         :'ws_b', :'conv_b', :'contact_b', 'cruce'),
  '42501', null, 'El Telar no escribe en otro espacio');
select throws_ok(format('select private.telar_credential_secret(%L::uuid)', :'cred_b'),
  '42501', null, 'El Telar no descifra credenciales de otro espacio');

select tests.act_as_telar(null) \g /dev/null
select results_eq($$ select count(*)::int from public.message $$, $$ values (0) $$,
  'El Telar sin contexto no ve nada');
select tests.reset_role() \g /dev/null

select * from finish();
rollback;

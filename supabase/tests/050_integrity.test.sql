-- Integridad: idempotencia a nivel de base (T-02), llaves que impiden cruzar espacios,
-- versiones publicadas inmutables y al menos un dueño por espacio.
begin;
select plan(12);

do $$
declare
  v_ws uuid;
  v_ws2 uuid;
  v_cred uuid;
  v_channel uuid;
  v_contact uuid;
  v_conv uuid;
begin
  perform tests.create_user('vale');
  perform tests.authenticate_as('vale');
  v_ws := public.create_workspace('Vivero Vale', 'vivero-vale', 'EC');
  v_ws2 := public.create_workspace('Segundo Vivero', 'segundo-vivero', 'EC');
  perform tests.reset_role();
  v_cred := private.store_credential_admin(v_ws, 'meta', 'Meta',
    '{"appSecret": "aaaaaaaaaaaa", "accessToken": "bbbbbbbbbbbb", "verifyToken": "cccccccccccc"}'::jsonb);
  insert into public.channel (workspace_id, credential_id, type, external_id)
  values (v_ws, v_cred, 'whatsapp', '200000000001') returning id into v_channel;
  insert into public.contact (workspace_id, channel_id, external_id)
  values (v_ws, v_channel, '593980000001') returning id into v_contact;
  insert into public.conversation (workspace_id, channel_id, contact_id)
  values (v_ws, v_channel, v_contact) returning id into v_conv;
  insert into public.message (workspace_id, conversation_id, channel_id, direction, author, channel_message_id, body, status)
  values (v_ws, v_conv, v_channel, 'inbound', 'contact', 'wamid.duplicado', 'Hola', 'received');
end
$$;

select w.id as ws, (select id from public.workspace where slug = 'segundo-vivero') as ws2,
       c.id as channel, cv.id as conv, m.id as msg
from public.workspace w
join public.channel c on c.workspace_id = w.id
join public.conversation cv on cv.workspace_id = w.id
join public.message m on m.conversation_id = cv.id
where w.slug = 'vivero-vale' \gset

select throws_ok(
  format('insert into public.message (workspace_id, conversation_id, channel_id, direction, author, channel_message_id, body, status) values (%L, %L, %L, %L, %L, %L, %L, %L)',
         :'ws', :'conv', :'channel', 'inbound', 'contact', 'wamid.duplicado', 'Hola', 'received'),
  '23505', null, 'El mismo id de mensaje del canal no entra dos veces');
select lives_ok(
  format('insert into public.message (workspace_id, conversation_id, channel_id, direction, author, in_reply_to, body, status) values (%L, %L, %L, %L, %L, %L, %L, %L)',
         :'ws', :'conv', :'channel', 'outbound', 'agent', :'msg', 'Respuesta', 'queued'),
  'La primera respuesta automática se registra');
select throws_ok(
  format('insert into public.message (workspace_id, conversation_id, channel_id, direction, author, in_reply_to, body, status) values (%L, %L, %L, %L, %L, %L, %L, %L)',
         :'ws', :'conv', :'channel', 'outbound', 'agent', :'msg', 'Respuesta repetida', 'queued'),
  '23505', null, 'Una segunda respuesta automática al mismo mensaje se rechaza');
select throws_ok(
  format('insert into public.message (workspace_id, conversation_id, channel_id, direction, author, body, status) values (%L, %L, %L, %L, %L, %L, %L)',
         :'ws2', :'conv', :'channel', 'inbound', 'contact', 'cruce', 'received'),
  '23503', null, 'Un mensaje no puede apuntar a la conversación de otro espacio');
select throws_ok(
  format('insert into public.message (workspace_id, conversation_id, channel_id, direction, author, body, status) values (%L, %L, %L, %L, %L, %L, %L)',
         :'ws', :'conv', :'channel', 'inbound', 'agent', 'autor inválido', 'received'),
  '23514', null, 'Un mensaje entrante solo puede venir del contacto');

-- Versiones del agente.
insert into public.agent_spec (workspace_id, version, spec) values (:'ws', 1, '{"business": {"name": "Vivero Vale"}}');
select id as spec from public.agent_spec where workspace_id = :'ws' and version = 1 \gset
select tests.authenticate_as('vale') \g /dev/null
select lives_ok(format('select public.publish_agent_spec(%L::uuid)', :'spec'), 'La dueña publica la versión 1');
select tests.reset_role() \g /dev/null
select throws_ok(format('update public.agent_spec set spec = %L::jsonb where id = %L', '{"business": {"name": "Otro"}}', :'spec'),
  '42501', null, 'Una versión publicada no se edita');
select throws_ok(format('delete from public.agent_spec where id = %L', :'spec'),
  '42501', null, 'Una versión publicada no se borra');

-- Siempre queda un dueño.
select throws_ok(format('delete from public.member where workspace_id = %L and user_id = %L', :'ws', tests.user_id('vale')),
  '23514', null, 'No se puede quitar al único dueño');

-- Auditoría: quitar a alguien de un espacio que sigue existiendo queda registrado; borrar el espacio
-- completo no choca con su auditoría y se la lleva en cascada.
select tests.create_user('wil') \g /dev/null
insert into public.member (workspace_id, user_id, role) values (:'ws', tests.user_id('wil'), 'agent');
delete from public.member where workspace_id = :'ws' and user_id = tests.user_id('wil');
select results_eq(
  format($$select action, details ->> 'role' from public.audit_log
           where workspace_id = %L and entity = 'member' and details ->> 'user_id' = %L order by id$$,
         :'ws', tests.user_id('wil')),
  $$ values ('insert'::text, 'agent'::text), ('delete', 'agent') $$,
  'Agregar y quitar a un miembro queda en la auditoría');
select tests.authenticate_as('vale') \g /dev/null
select lives_ok(format('select public.delete_workspace(%L::uuid)', :'ws2'), 'Borrar un espacio completo no choca con su auditoría');
select tests.reset_role() \g /dev/null
select is_empty(format('select 1 from public.audit_log where workspace_id = %L', :'ws2'),
  'La auditoría del espacio borrado se va con él');

select * from finish();
rollback;

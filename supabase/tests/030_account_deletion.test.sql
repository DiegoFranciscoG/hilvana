-- T-11 (parte de base de datos): eliminar la cuenta borra los datos del usuario.
-- El Telar llama a private.delete_account_data() y luego borra el usuario en Auth, lo que
-- elimina sus sesiones (auth.sessions en cascada) y cierra la sesión en todos sus dispositivos.
begin;
select plan(10);

do $$
begin
  perform tests.create_user('rosa');
  perform tests.create_user('saul');
  -- Rosa es la única persona en "taller-rosa" y dueña única de "bodega-compartida", donde Saúl es agente.
  perform tests.authenticate_as('rosa');
  perform public.create_workspace('Taller de Rosa', 'taller-rosa', 'EC');
  perform public.create_workspace('Bodega Compartida', 'bodega-compartida', 'EC');
  perform public.register_device_token('token-de-prueba-rosa-0123456789', 'android');
  perform tests.reset_role();
  insert into public.member (workspace_id, user_id, role)
  values (tests.workspace_id('bodega-compartida'), tests.user_id('saul'), 'agent');
  perform private.store_credential_admin(tests.workspace_id('taller-rosa'), 'ai', 'IA del taller',
    '{"apiKey": "T11-api-key-0000"}'::jsonb);
end
$$;

select tests.user_id('rosa') as rosa, tests.user_id('saul') as saul,
       tests.workspace_id('taller-rosa') as ws_solo, tests.workspace_id('bodega-compartida') as ws_shared \gset
select secret_id as solo_secret from public.credential where workspace_id = :'ws_solo' \gset

-- Una sesión activa de Rosa (el esquema de Auth lo crea GoTrue, como en el compose y en la nube).
insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), :'rosa', now(), now());
select is(tests.auth_sessions(:'rosa'), 1, 'Rosa tiene una sesión abierta antes de eliminar su cuenta');

select tests.act_as_telar(null) \g /dev/null
select results_eq(
  format('select private.delete_account_data(%L::uuid)', :'rosa'),
  $$ values ('{"leftWorkspaces": 1, "promotedOwners": 1, "deletedWorkspaces": 1}'::jsonb) $$,
  'La función informa qué espacios se borraron y cuáles cambiaron de dueño');
select tests.reset_role() \g /dev/null

select is_empty(format('select 1 from public.workspace where id = %L', :'ws_solo'),
  'El espacio donde Rosa estaba sola se elimina');
select is_empty(format('select 1 from vault.secrets where id = %L', :'solo_secret'),
  'Los secretos de ese espacio salen de Vault');
select isnt_empty(format('select 1 from public.workspace where id = %L', :'ws_shared'),
  'El espacio compartido sigue existiendo');
select results_eq(format('select role from public.member where workspace_id = %L and user_id = %L', :'ws_shared', :'saul'),
  $$ values ('owner'::text) $$,
  'El miembro más antiguo pasa a ser dueño');
select is_empty(format('select 1 from public.member where user_id = %L', :'rosa'),
  'Rosa ya no es miembro de ningún espacio');
select is_empty(format('select 1 from public.device_token where user_id = %L', :'rosa'),
  'Sus tokens de push se borran');

-- Lo que hace la API de Auth al eliminar el usuario.
select lives_ok(format('delete from auth.users where id = %L', :'rosa'), 'El usuario se puede borrar de Auth');
select is(tests.auth_sessions(:'rosa'), 0, 'No quedan sesiones del usuario (cierre en todos los dispositivos)');

select * from finish();
rollback;

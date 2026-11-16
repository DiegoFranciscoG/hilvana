-- T-04: ninguna clave de API aparece en texto plano en tablas ni respuestas; Vault la cifra
-- y solo el Telar la descifra, para el espacio fijado.
begin;
select plan(13);

do $$
begin
  perform tests.create_user('olga');
  perform tests.create_user('pablo');
  perform tests.authenticate_as('olga');
  perform public.create_workspace('Óptica Olga', 'optica-olga', 'EC');
  perform tests.reset_role();
  insert into public.member (workspace_id, user_id, role)
  values (tests.workspace_id('optica-olga'), tests.user_id('pablo'), 'agent');
end
$$;

select tests.workspace_id('optica-olga') as ws \gset

-- La dueña guarda una credencial por la RPC (como lo haría la app).
select tests.authenticate_as('olga') \g /dev/null
select public.store_credential(:'ws', 'meta', 'Meta de Óptica Olga',
  '{"appSecret": "T04-app-secret-6f1d2c", "accessToken": "T04-access-token-9a8b7c", "verifyToken": "T04-verify-token-1e2f3a"}'::jsonb,
  '{"appId": "1234567890"}'::jsonb) as cred \gset

select results_eq(
  format('select count(*)::int from public.credential where id = %L and to_jsonb(credential)::text like %L', :'cred', '%T04-%'),
  $$ values (0) $$,
  'La fila visible para la dueña no contiene el secreto');
select results_eq(
  format('select public_config ->> %L from public.credential where id = %L', 'appId', :'cred'),
  $$ values ('1234567890'::text) $$,
  'La configuración pública sí es visible');
select throws_ok($$ select count(*) from vault.decrypted_secrets $$, '42501', null,
  'Un usuario autenticado no puede leer la vista descifrada de Vault');
select throws_ok($$ select count(*) from vault.secrets $$, '42501', null,
  'Un usuario autenticado no puede leer la tabla de Vault');
select throws_ok(
  format('select private.telar_credential_secret(%L::uuid)', :'cred'),
  '42501', null, 'Un usuario autenticado no puede llamar a la función de descifrado');
select throws_ok(
  format('insert into public.credential (workspace_id, provider, label, secret_id, public_config) values (%L, %L, %L, gen_random_uuid(), %L::jsonb)',
         :'ws', 'meta', 'directa', '{"accessToken": "nunca-aqui"}'),
  '42501', null, 'Nadie inserta credenciales directo en la tabla');
select tests.reset_role() \g /dev/null

-- Como administrador: el secreto no está en claro en ninguna tabla de Hilvana ni en vault.secrets.
select results_eq($$ select tests.count_plaintext('T04-') $$, $$ values (0::bigint) $$,
  'Ninguna tabla de public/private contiene el secreto en claro');
select results_eq(
  format('select count(*)::int from vault.secrets s join public.credential c on c.secret_id = s.id where c.id = %L and s.secret like %L',
         :'cred', '%T04-%'),
  $$ values (0) $$,
  'vault.secrets guarda el secreto cifrado');
select throws_ok(
  format('insert into public.credential (workspace_id, provider, label, secret_id, public_config) values (%L, %L, %L, gen_random_uuid(), %L::jsonb)',
         :'ws', 'meta', 'directa', '{"accessToken": "nunca-aqui"}'),
  '23514', null, 'La configuración pública rechaza campos de secreto');

-- El Telar descifra solo con el espacio correcto fijado.
select tests.act_as_telar(:'ws') \g /dev/null
select results_eq(
  format('select private.telar_credential_secret(%L::uuid) ->> %L', :'cred', 'accessToken'),
  $$ values ('T04-access-token-9a8b7c'::text) $$,
  'El Telar descifra la credencial del espacio fijado');
select tests.reset_role() \g /dev/null

-- Revocar borra el secreto de Vault.
select tests.authenticate_as('olga') \g /dev/null
select lives_ok(format('select public.revoke_credential(%L::uuid)', :'cred'), 'La dueña revoca la credencial');
select tests.reset_role() \g /dev/null
select results_eq(
  format('select count(*)::int from vault.secrets s join public.credential c on c.secret_id = s.id where c.id = %L', :'cred'),
  $$ values (0) $$,
  'Al revocar, el secreto desaparece de Vault');

-- Borrar el espacio borra también los secretos de sus credenciales.
select private.store_credential_admin(:'ws', 'ai', 'Proveedor de IA', '{"apiKey": "T04-api-key-77aa"}'::jsonb) as cred_ai \gset
select secret_id as ai_secret from public.credential where id = :'cred_ai' \gset
select tests.authenticate_as('olga') \g /dev/null
select public.delete_workspace(:'ws') \g /dev/null
select tests.reset_role() \g /dev/null
select results_eq(format('select count(*)::int from vault.secrets where id = %L', :'ai_secret'), $$ values (0) $$,
  'Eliminar el espacio elimina los secretos de sus credenciales');

select * from finish();
rollback;

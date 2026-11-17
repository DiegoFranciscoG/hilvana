-- Dispositivos para avisos push: cada persona registra y da de baja solo los suyos.
begin;
select plan(5);

select tests.create_user('nora') \g /dev/null
select tests.create_user('omar') \g /dev/null
select tests.user_id('nora') as nora, 'fid-de-prueba-' || 'nora-0001' as fid \gset

select tests.authenticate_as('nora') \g /dev/null
select lives_ok(format('select public.register_device_token(%L, %L)', :'fid', 'android'),
  'Nora registra el FID de su teléfono');
select tests.reset_role() \g /dev/null
select results_eq(format('select user_id from public.device_token where token = %L', :'fid'),
  format('values (%L::uuid)', :'nora'), 'El dispositivo queda a nombre de Nora');

select tests.authenticate_as('omar') \g /dev/null
select public.unregister_device_token(:'fid') \g /dev/null
select tests.reset_role() \g /dev/null
select isnt_empty(format('select 1 from public.device_token where token = %L', :'fid'),
  'Omar no puede dar de baja el dispositivo de Nora');

select tests.authenticate_as('nora') \g /dev/null
select public.unregister_device_token(:'fid') \g /dev/null
select tests.reset_role() \g /dev/null
select is_empty(format('select 1 from public.device_token where token = %L', :'fid'),
  'Nora da de baja su dispositivo al apagar los avisos o cerrar sesión');

select tests.act_as_anon() \g /dev/null
select throws_ok(format('select public.unregister_device_token(%L)', :'fid'), '42501', null,
  'Sin sesión no se puede llamar');
select tests.reset_role() \g /dev/null

select * from finish();
rollback;

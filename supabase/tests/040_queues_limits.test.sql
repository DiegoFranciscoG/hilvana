-- Colas por espacio y límites (base de T-10): la cola y la cubeta de un espacio no afectan a otro.
begin;
select plan(12);

do $$
begin
  perform tests.create_user('tere');
  perform tests.create_user('ugo');
  perform tests.authenticate_as('tere');
  perform public.create_workspace('Tienda Tere', 'tienda-tere', 'EC');
  perform tests.authenticate_as('ugo');
  perform public.create_workspace('Librería Ugo', 'libreria-ugo', 'PE', null, 'America/Lima');
  perform tests.reset_role();
end
$$;

select tests.workspace_id('tienda-tere') as ws_a, tests.workspace_id('libreria-ugo') as ws_b \gset

select ok(exists (select 1 from pgmq.list_queues() q where q.queue_name = private.queue_name(:'ws_a')),
  'Crear un espacio crea su cola');

select tests.act_as_telar(null) \g /dev/null
select ok(private.telar_enqueue(:'ws_a', '{"n": 1}'::jsonb) > 0, 'El Telar encola en el espacio A');
select ok(private.telar_enqueue(:'ws_a', '{"n": 2}'::jsonb) > 0, 'El Telar encola otro mensaje en A');
select throws_ok($$ select * from private.telar_read(10, 30) $$, '42501', null,
  'Leer la cola exige fijar un espacio');
select ok(
  :'ws_a' in (select * from private.telar_pending_workspaces())
  and :'ws_b' not in (select * from private.telar_pending_workspaces()),
  'A tiene trabajo pendiente y B no');

select tests.act_as_telar(:'ws_b') \g /dev/null
select is_empty($$ select * from private.telar_read(10, 30) $$, 'B no ve los mensajes de A');

select tests.act_as_telar(:'ws_a') \g /dev/null
select results_eq($$ select (message ->> 'n')::int from private.telar_read(10, 30) order by msg_id $$,
  $$ values (1), (2) $$, 'A lee sus mensajes en orden');
select is_empty($$ select * from private.telar_read(10, 30) $$,
  'Un mensaje leído queda oculto durante la ventana de visibilidad');

-- Cubeta: el plan "starter" permite 30 mensajes por minuto.
select results_eq($$ select count(*)::int from generate_series(1, 30) g where private.telar_take_tokens(1) $$,
  $$ values (30) $$, 'A consume sus 30 tokens del minuto');
select ok(not private.telar_take_tokens(1), 'El token 31 de A se rechaza');

select tests.act_as_telar(:'ws_b') \g /dev/null
select ok(private.telar_take_tokens(1), 'B conserva su cubeta aunque A esté saturado');
select tests.reset_role() \g /dev/null

-- Borrar el espacio elimina su cola.
select tests.authenticate_as('tere') \g /dev/null
select public.delete_workspace(:'ws_a') \g /dev/null
select tests.reset_role() \g /dev/null
select ok(not exists (select 1 from pgmq.list_queues() q where q.queue_name = private.queue_name(:'ws_a')),
  'Borrar el espacio elimina su cola');

select * from finish();
rollback;

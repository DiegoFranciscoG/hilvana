-- Utilidades de prueba (se instalan una vez y quedan en el esquema `tests` de la base local).
-- Crean usuarios reales en auth.users y simulan sesiones con los mismos claims que emite Auth.

create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, hilvana_telar;

-- Permite a las pruebas actuar como el rol del Telar (el creador tiene ADMIN sobre el rol).
grant hilvana_telar to postgres;

create or replace function tests.create_user(p_handle text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
          p_handle || '@hilvana.test', '{"provider": "email", "providers": ["email"]}', '{}', now(), now());
  return v_id;
end
$$;

create or replace function tests.user_id(p_handle text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where u.email = p_handle || '@hilvana.test'
$$;

create or replace function tests.workspace_id(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id from public.workspace w where w.slug = p_slug
$$;

create or replace function tests.authenticate_as(p_handle text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := tests.user_id(p_handle);
begin
  if v_id is null then
    raise exception 'test user % not found', p_handle;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated', 'email', p_handle || '@hilvana.test')::text, true);
end
$$;

create or replace function tests.act_as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end
$$;

create or replace function tests.act_as_telar(p_workspace_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'hilvana_telar', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('hilvana.workspace_id', coalesce(p_workspace_id::text, ''), true);
end
$$;

create or replace function tests.reset_role()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('hilvana.workspace_id', '', true);
end
$$;

-- Busca un texto en todas las filas de las tablas de Hilvana (T-04).
create or replace function tests.count_plaintext(p_needle text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table record;
  v_total bigint := 0;
  v_count bigint;
begin
  for v_table in
    select n.nspname, c.relname
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'private')
  loop
    execute format('select count(*) from %I.%I t where t::text like %L', v_table.nspname, v_table.relname,
                   '%' || p_needle || '%')
      into v_count;
    v_total := v_total + v_count;
  end loop;
  return v_total;
end
$$;

-- Sesiones de Auth del usuario; -1 si la imagen no trae el esquema completo de Auth.
create or replace function tests.auth_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if to_regclass('auth.sessions') is null then
    return -1;
  end if;
  execute 'select count(*) from auth.sessions where user_id = $1' into v_count using p_user_id;
  return v_count;
end
$$;

grant execute on all functions in schema tests to anon, authenticated, hilvana_telar;

begin;
select plan(2);
select has_function('tests', 'create_user', array['text'], 'helpers de prueba instalados');
select has_extension('pgtap', 'pgTAP disponible');
select * from finish();
rollback;

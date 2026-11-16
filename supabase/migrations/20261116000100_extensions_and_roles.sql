-- Extensiones, esquemas y roles de Hilvana.
-- Fuentes: docs/investigacion.md #3 (Queues), #4 (Vault), #6 (RLS y esquema private).

create extension if not exists vector with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Esquema no expuesto por la API: funciones con privilegios y tablas internas.
create schema if not exists private;
revoke all on schema private from public;

-- Toda función nueva de este rol nace sin EXECUTE para PUBLIC ni anon; cada migración
-- concede EXECUTE explícitamente a quien corresponde (los privilegios por esquema solo
-- suman a los globales, por eso la revocación a PUBLIC es global).
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- Rol del Telar (pasarela y trabajador). Sin BYPASSRLS: solo ve el espacio fijado
-- con `set local hilvana.workspace_id`. El login y la contraseña los fija
-- `scripts/db-bootstrap.sh` desde el entorno, nunca una migración.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hilvana_telar') then
    create role hilvana_telar nologin noinherit;
  end if;
end
$$;

grant usage on schema public to hilvana_telar;
grant usage on schema private to authenticated, hilvana_telar;
grant usage on schema extensions to hilvana_telar;

-- Espacio fijado en la transacción actual (solo lo usa el rol del Telar).
create or replace function private.current_workspace_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('hilvana.workspace_id', true), '')::uuid
$$;

grant execute on function private.current_workspace_id() to authenticated, hilvana_telar;

-- Mantiene updated_at sin depender del cliente.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Nombre de la cola pgmq de un espacio: ws_<uuid sin guiones> (35 caracteres).
create or replace function private.queue_name(p_workspace_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'ws_' || replace(p_workspace_id::text, '-', '')
$$;

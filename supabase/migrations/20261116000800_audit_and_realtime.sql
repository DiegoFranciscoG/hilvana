-- Auditoría: quién cambió qué y cuándo. Solo se guardan las columnas que se nombran en el
-- disparador; nunca cuerpos de mensajes ni secretos.

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_details jsonb := '{}'::jsonb;
  v_column text;
  v_workspace uuid;
  v_actor uuid := (select auth.uid());
begin
  foreach v_column in array tg_argv loop
    if tg_op <> 'UPDATE' or (v_row -> v_column) is distinct from (v_old -> v_column) then
      v_details := v_details || jsonb_build_object(v_column, v_row -> v_column);
    end if;
  end loop;
  if tg_op = 'UPDATE' and v_details = '{}'::jsonb then
    return new;
  end if;
  v_workspace := coalesce((v_row ->> 'workspace_id')::uuid, case when tg_table_name = 'workspace' then (v_row ->> 'id')::uuid end);
  -- Al borrar un espacio sus filas de auditoría se van en cascada: no se registra el borrado.
  if tg_op = 'DELETE' and (tg_table_name = 'workspace' or pg_trigger_depth() > 1) then
    return old;
  end if;
  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, entity, entity_id, details)
  values (
    v_workspace,
    v_actor,
    case when v_actor is not null then 'user' when current_user = 'hilvana_telar' then 'service' else 'system' end,
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    v_details
  );
  return coalesce(new, old);
end
$$;

create trigger workspace_audit after insert or update on public.workspace
  for each row execute function private.audit_row('name', 'plan_code', 'active_agent_spec_id');
create trigger member_audit after insert or update or delete on public.member
  for each row execute function private.audit_row('user_id', 'role');
create trigger credential_audit after insert or update or delete on public.credential
  for each row execute function private.audit_row('provider', 'label', 'status');
create trigger channel_audit after insert or update or delete on public.channel
  for each row execute function private.audit_row('type', 'external_id', 'status');
create trigger agent_spec_audit after insert or update or delete on public.agent_spec
  for each row execute function private.audit_row('version', 'status');
create trigger conversation_audit after update on public.conversation
  for each row execute function private.audit_row('status', 'assigned_to');

-- Realtime (#7): la bandeja escucha conversaciones, mensajes, pases a humano y alertas.
-- RLS filtra cada cambio por suscriptor.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.conversation, public.message, public.handoff, public.contract_alert;
  end if;
end
$$;

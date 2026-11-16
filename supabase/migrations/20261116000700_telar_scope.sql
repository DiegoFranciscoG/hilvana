-- Rol del Telar: ve únicamente el espacio fijado con `set local hilvana.workspace_id`.
-- Si un error de código olvidara fijarlo, current_workspace_id() es nulo y no ve nada.

grant select on public.plan to hilvana_telar;
create policy plan_telar_read on public.plan for select to hilvana_telar using (true);

grant select on public.workspace to hilvana_telar;
create policy workspace_telar_scope on public.workspace for select to hilvana_telar
  using (id = private.current_workspace_id());

grant select on public.member, public.credential, public.channel, public.agent_spec to hilvana_telar;
create policy member_telar_scope on public.member for select to hilvana_telar
  using (workspace_id = private.current_workspace_id());
create policy credential_telar_scope on public.credential for select to hilvana_telar
  using (workspace_id = private.current_workspace_id());
create policy channel_telar_scope on public.channel for select to hilvana_telar
  using (workspace_id = private.current_workspace_id());
create policy agent_spec_telar_scope on public.agent_spec for select to hilvana_telar
  using (workspace_id = private.current_workspace_id());

grant update (last_used_at) on public.credential to hilvana_telar;
create policy credential_telar_touch on public.credential for update to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());

grant select, insert, update on public.contact, public.conversation, public.message,
  public.lead, public.handoff, public.usage_daily to hilvana_telar;
grant select, insert, update, delete on public.knowledge_chunk, public.contract,
  public.contract_sample, public.contract_alert to hilvana_telar;
grant delete on public.message, public.contact to hilvana_telar;
grant insert on public.audit_log to hilvana_telar;

create policy contact_telar_scope on public.contact for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy conversation_telar_scope on public.conversation for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy message_telar_scope on public.message for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy lead_telar_scope on public.lead for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy handoff_telar_scope on public.handoff for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy usage_telar_scope on public.usage_daily for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy knowledge_telar_scope on public.knowledge_chunk for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy contract_telar_scope on public.contract for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy contract_sample_telar_scope on public.contract_sample for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy contract_alert_telar_scope on public.contract_alert for all to hilvana_telar
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());
create policy audit_telar_insert on public.audit_log for insert to hilvana_telar
  with check (workspace_id = private.current_workspace_id());

-- Canal destino de un webhook dentro del espacio fijado (enrutamiento por id externo).
create or replace function private.telar_resolve_channel(p_type text, p_external_id text, p_credential_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.channel c
  where c.type = p_type and c.external_id = p_external_id and c.credential_id = p_credential_id
    and c.status = 'active' and c.workspace_id = private.current_workspace_id()
$$;
revoke execute on function private.telar_resolve_channel(text, text, uuid) from public, anon, authenticated;
grant execute on function private.telar_resolve_channel(text, text, uuid) to hilvana_telar;

-- Espacio dueño de una conversación (la API lo usa antes de fijar el contexto; no devuelve datos).
create or replace function private.telar_conversation_workspace(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.workspace_id from public.conversation c where c.id = p_conversation_id
$$;
revoke execute on function private.telar_conversation_workspace(uuid) from public, anon, authenticated;
grant execute on function private.telar_conversation_workspace(uuid) to hilvana_telar;

-- Todos los espacios (solo ids) para tareas de mantenimiento: embeddings pendientes y retención.
create or replace function private.telar_workspaces()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id from public.workspace w order by w.id
$$;
revoke execute on function private.telar_workspaces() from public, anon, authenticated;
grant execute on function private.telar_workspaces() to hilvana_telar;

-- Tokens de push de los miembros del espacio fijado (para avisar de un pase a humano).
create or replace function private.telar_member_device_tokens()
returns table (user_id uuid, token text, platform text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.user_id, d.token, d.platform
  from public.device_token d
  join public.member m on m.user_id = d.user_id
  where m.workspace_id = private.current_workspace_id() and m.role in ('owner', 'agent')
$$;
revoke execute on function private.telar_member_device_tokens() from public, anon, authenticated;
grant execute on function private.telar_member_device_tokens() to hilvana_telar;

-- Retención (LOPDP art. 15.4): borra mensajes más viejos que la retención del plan.
create or replace function private.telar_purge_expired()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_count integer;
begin
  select p.retention_days into v_days
  from public.workspace w join public.plan p on p.code = w.plan_code
  where w.id = private.current_workspace_id();
  if v_days is null then
    raise exception 'workspace context required' using errcode = '42501';
  end if;
  delete from public.message m
  where m.workspace_id = private.current_workspace_id()
    and m.created_at < now() - make_interval(days => v_days);
  get diagnostics v_count = row_count;
  delete from private.webhook_receipt r where r.received_at < now() - interval '7 days';
  return v_count;
end
$$;
revoke execute on function private.telar_purge_expired() from public, anon, authenticated;
grant execute on function private.telar_purge_expired() to hilvana_telar;

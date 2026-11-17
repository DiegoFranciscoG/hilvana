-- Operaciones de la app que necesitan validar el rol antes de escribir.
-- Todas son security definer con search_path vacío y comprueban la membresía explícitamente.

create or replace function private.require_role(p_workspace_id uuid, p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.member m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  ) then
    raise exception 'insufficient role for this workspace' using errcode = '42501';
  end if;
end
$$;
revoke execute on function private.require_role(uuid, text[]) from public, anon, authenticated;

-- Crear un espacio: quien lo crea queda como dueño. La cola nace con el disparador.
create or replace function public.create_workspace(
  p_name text,
  p_slug text,
  p_country_code text,
  p_industry text default null,
  p_timezone text default 'America/Guayaquil'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = p_timezone) then
    raise exception 'unknown time zone %', p_timezone using errcode = '22023';
  end if;
  insert into public.workspace (name, slug, country_code, industry, timezone)
  values (btrim(p_name), lower(btrim(p_slug)), upper(btrim(p_country_code)), nullif(btrim(p_industry), ''), p_timezone)
  returning id into v_id;
  insert into public.member (workspace_id, user_id, role) values (v_id, (select auth.uid()), 'owner');
  return v_id;
end
$$;
revoke execute on function public.create_workspace(text, text, text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text, text, text) to authenticated;

-- Eliminar un espacio y todos sus datos (credenciales y secretos incluidos).
create or replace function public.delete_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(p_workspace_id, array['owner']);
  delete from public.workspace where id = p_workspace_id;
end
$$;
revoke execute on function public.delete_workspace(uuid) from public, anon;
grant execute on function public.delete_workspace(uuid) to authenticated;

-- Agregar a una persona que ya tiene cuenta. Solo dueños.
create or replace function public.add_member(p_workspace_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform private.require_role(p_workspace_id, array['owner']);
  if p_role not in ('owner', 'agent', 'viewer') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'no account with that email' using errcode = 'P0002';
  end if;
  insert into public.member (workspace_id, user_id, role) values (p_workspace_id, v_user, p_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  return v_user;
end
$$;
revoke execute on function public.add_member(uuid, text, text) from public, anon;
grant execute on function public.add_member(uuid, text, text) to authenticated;

create or replace function public.remove_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id <> (select auth.uid()) then
    perform private.require_role(p_workspace_id, array['owner']);
  end if;
  delete from public.member where workspace_id = p_workspace_id and user_id = p_user_id;
end
$$;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- Tomar, devolver y cerrar conversaciones.
create or replace function private.conversation_workspace(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.workspace_id from public.conversation c where c.id = p_conversation_id
$$;
revoke execute on function private.conversation_workspace(uuid) from public, anon, authenticated;

create or replace function public.take_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(private.conversation_workspace(p_conversation_id), array['owner', 'agent']);
  update public.conversation
  set status = 'human', assigned_to = (select auth.uid()), unread_count = 0
  where id = p_conversation_id and status <> 'closed';
end
$$;

create or replace function public.release_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(private.conversation_workspace(p_conversation_id), array['owner', 'agent']);
  update public.conversation
  set status = 'agent', assigned_to = null
  where id = p_conversation_id and status <> 'closed';
  update public.handoff set resolved_at = now(), resolved_by = (select auth.uid())
  where conversation_id = p_conversation_id and resolved_at is null;
end
$$;

create or replace function public.close_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(private.conversation_workspace(p_conversation_id), array['owner', 'agent']);
  update public.conversation set status = 'closed', assigned_to = null where id = p_conversation_id;
  update public.handoff set resolved_at = now(), resolved_by = (select auth.uid())
  where conversation_id = p_conversation_id and resolved_at is null;
end
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(private.conversation_workspace(p_conversation_id), array['owner', 'agent', 'viewer']);
  update public.conversation set unread_count = 0 where id = p_conversation_id;
end
$$;

revoke execute on function public.take_conversation(uuid), public.release_conversation(uuid),
  public.close_conversation(uuid), public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.take_conversation(uuid), public.release_conversation(uuid),
  public.close_conversation(uuid), public.mark_conversation_read(uuid) to authenticated;

-- Publicar una versión del agente y volver a una anterior.
create or replace function public.publish_agent_spec(p_spec_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select s.workspace_id into v_workspace from public.agent_spec s where s.id = p_spec_id and s.status = 'draft';
  if v_workspace is null then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  perform private.require_role(v_workspace, array['owner']);
  update public.agent_spec set status = 'published', published_at = now() where id = p_spec_id;
  update public.workspace set active_agent_spec_id = p_spec_id where id = v_workspace;
end
$$;

create or replace function public.activate_agent_spec(p_spec_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select s.workspace_id into v_workspace from public.agent_spec s where s.id = p_spec_id and s.status = 'published';
  if v_workspace is null then
    raise exception 'published version not found' using errcode = 'P0002';
  end if;
  perform private.require_role(v_workspace, array['owner']);
  update public.workspace set active_agent_spec_id = p_spec_id where id = v_workspace;
end
$$;
revoke execute on function public.publish_agent_spec(uuid), public.activate_agent_spec(uuid) from public, anon;
grant execute on function public.publish_agent_spec(uuid), public.activate_agent_spec(uuid) to authenticated;

-- Derechos del titular (LOPDP arts. 13, 15, 16 y 17; Ley 29733): consentimiento,
-- exportación y eliminación de un contacto.
create or replace function public.set_contact_consent(p_contact_id uuid, p_consent boolean, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select c.workspace_id into v_workspace from public.contact c where c.id = p_contact_id;
  perform private.require_role(v_workspace, array['owner', 'agent']);
  if p_consent then
    update public.contact
    set consent_marketing = true, consent_marketing_at = now(), consent_source = left(btrim(p_source), 120),
        opted_out_at = null
    where id = p_contact_id;
  else
    update public.contact
    set consent_marketing = false, opted_out_at = now(), consent_source = left(btrim(p_source), 120)
    where id = p_contact_id;
  end if;
end
$$;

create or replace function public.export_contact(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_result jsonb;
begin
  select c.workspace_id into v_workspace from public.contact c where c.id = p_contact_id;
  perform private.require_role(v_workspace, array['owner']);
  select jsonb_build_object(
    'exportedAt', now(),
    'contact', to_jsonb(c) - 'workspace_id',
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cv.id, 'status', cv.status, 'createdAt', cv.created_at,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'direction', m.direction, 'author', m.author, 'kind', m.kind, 'body', m.body, 'createdAt', m.created_at
          ) order by m.created_at)
          from public.message m where m.conversation_id = cv.id
        ), '[]'::jsonb)
      ) order by cv.created_at)
      from public.conversation cv where cv.contact_id = c.id
    ), '[]'::jsonb),
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object('interest', l.interest, 'status', l.status, 'createdAt', l.created_at))
      from public.lead l where l.contact_id = c.id
    ), '[]'::jsonb)
  ) into v_result
  from public.contact c where c.id = p_contact_id;
  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, entity, entity_id, details)
  values (v_workspace, (select auth.uid()), 'user', 'event', 'contact', p_contact_id::text, '{"op": "export"}'::jsonb);
  return v_result;
end
$$;

create or replace function public.erase_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select c.workspace_id into v_workspace from public.contact c where c.id = p_contact_id;
  perform private.require_role(v_workspace, array['owner']);
  delete from public.contact where id = p_contact_id;
  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, entity, entity_id, details)
  values (v_workspace, (select auth.uid()), 'user', 'event', 'contact', p_contact_id::text, '{"op": "erase"}'::jsonb);
end
$$;
revoke execute on function public.set_contact_consent(uuid, boolean, text), public.export_contact(uuid),
  public.erase_contact(uuid) from public, anon;
grant execute on function public.set_contact_consent(uuid, boolean, text), public.export_contact(uuid),
  public.erase_contact(uuid) to authenticated;

-- Alertas de deriva del laboratorio.
create or replace function public.ack_contract_alert(p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select a.workspace_id into v_workspace from public.contract_alert a where a.id = p_alert_id;
  perform private.require_role(v_workspace, array['owner', 'agent']);
  update public.contract_alert set acknowledged_at = now(), acknowledged_by = (select auth.uid())
  where id = p_alert_id and acknowledged_at is null;
end
$$;
revoke execute on function public.ack_contract_alert(uuid) from public, anon;
grant execute on function public.ack_contract_alert(uuid) to authenticated;

-- Registrar el destino de push del dispositivo actual: el ID de instalación de Firebase (FID) que
-- el Telar usa en el campo `fid` de la API HTTP v1 de FCM.
create or replace function public.register_device_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.device_token (user_id, token, platform)
  values ((select auth.uid()), p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end
$$;
revoke execute on function public.register_device_token(text, text) from public, anon;
grant execute on function public.register_device_token(text, text) to authenticated;

-- Dar de baja el dispositivo (avisos apagados o sesión cerrada). Solo borra filas de quien llama.
create or replace function public.unregister_device_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  delete from public.device_token where token = p_token and user_id = (select auth.uid());
end
$$;
revoke execute on function public.unregister_device_token(text) from public, anon;
grant execute on function public.unregister_device_token(text) to authenticated;

-- Eliminación de cuenta (Apple 5.1.1(v), Google Play; T-11). La llama el Telar después de
-- verificar el JWT; luego borra el usuario con la API de administración de Auth, que cierra
-- todas sus sesiones. Aquí se limpian los datos de la app:
--   * espacios donde la persona es el único miembro: se eliminan completos;
--   * espacios compartidos donde es el único dueño: el miembro más antiguo pasa a dueño;
--   * tokens de push y membresías: se borran.
create or replace function private.delete_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_deleted int := 0;
  v_promoted int := 0;
  v_left int := 0;
  v_heir uuid;
begin
  for v_row in
    select m.workspace_id, m.role,
           (select count(*) from public.member o where o.workspace_id = m.workspace_id) as members,
           (select count(*) from public.member o where o.workspace_id = m.workspace_id and o.role = 'owner') as owners
    from public.member m where m.user_id = p_user_id
  loop
    if v_row.members = 1 then
      delete from public.workspace where id = v_row.workspace_id;
      v_deleted := v_deleted + 1;
    else
      if v_row.role = 'owner' and v_row.owners = 1 then
        select o.user_id into v_heir from public.member o
        where o.workspace_id = v_row.workspace_id and o.user_id <> p_user_id
        order by o.created_at, o.user_id limit 1;
        update public.member set role = 'owner' where workspace_id = v_row.workspace_id and user_id = v_heir;
        v_promoted := v_promoted + 1;
      end if;
      delete from public.member where workspace_id = v_row.workspace_id and user_id = p_user_id;
      v_left := v_left + 1;
    end if;
  end loop;
  delete from public.device_token where user_id = p_user_id;
  return jsonb_build_object('deletedWorkspaces', v_deleted, 'promotedOwners', v_promoted, 'leftWorkspaces', v_left);
end
$$;
revoke execute on function private.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function private.delete_account_data(uuid) to hilvana_telar;

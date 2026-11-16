-- Políticas RLS para miembros autenticados (T-03).
-- Patrón recomendado por Supabase (#6): la lista de espacios del usuario se calcula una vez
-- por sentencia con una función security definer en un esquema no expuesto.

create or replace function private.my_workspace_ids(p_roles text[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.member m
  where m.user_id = (select auth.uid())
    and (p_roles is null or m.role = any (p_roles))
$$;
revoke execute on function private.my_workspace_ids(text[]) from public, anon;
grant execute on function private.my_workspace_ids(text[]) to authenticated;

-- Activar RLS en todas las tablas expuestas.
alter table public.plan enable row level security;
alter table public.workspace enable row level security;
alter table public.member enable row level security;
alter table public.credential enable row level security;
alter table public.channel enable row level security;
alter table public.contact enable row level security;
alter table public.conversation enable row level security;
alter table public.message enable row level security;
alter table public.agent_spec enable row level security;
alter table public.knowledge_chunk enable row level security;
alter table public.lead enable row level security;
alter table public.handoff enable row level security;
alter table public.contract enable row level security;
alter table public.contract_sample enable row level security;
alter table public.contract_alert enable row level security;
alter table public.usage_daily enable row level security;
alter table public.audit_log enable row level security;
alter table public.device_token enable row level security;
alter table private.rate_bucket enable row level security;
alter table private.webhook_receipt enable row level security;
alter table private.setting enable row level security;

-- anon no toca nada de Hilvana; authenticated solo lo que concede cada política.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all sequences in schema public from anon;

-- Catálogo de planes: lectura para cualquier sesión.
create policy plan_read on public.plan for select to authenticated using (true);

-- Espacios: los miembros leen; los dueños editan nombre, rubro y zona horaria.
create policy workspace_read on public.workspace for select to authenticated
  using (id in (select private.my_workspace_ids()));
create policy workspace_owner_update on public.workspace for update to authenticated
  using (id in (select private.my_workspace_ids(array['owner'])))
  with check (id in (select private.my_workspace_ids(array['owner'])));
revoke update on public.workspace from authenticated;
grant update (name, industry, timezone) on public.workspace to authenticated;

-- Miembros: se ven entre sí dentro del mismo espacio. Altas y bajas por RPC.
create policy member_read on public.member for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));

-- Credenciales: solo metadatos y solo para dueños. El secreto vive en Vault.
create policy credential_owner_read on public.credential for select to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner'])));

-- Canales: lectura para miembros; los dueños los administran.
create policy channel_read on public.channel for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy channel_owner_insert on public.channel for insert to authenticated
  with check (workspace_id in (select private.my_workspace_ids(array['owner'])));
create policy channel_owner_update on public.channel for update to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner'])))
  with check (workspace_id in (select private.my_workspace_ids(array['owner'])));
create policy channel_owner_delete on public.channel for delete to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner'])));

-- Contactos: lectura para miembros; etiquetas por dueños y agentes. Consentimiento y
-- borrado por RPC para que quede auditado.
create policy contact_read on public.contact for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy contact_staff_update on public.contact for update to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner', 'agent'])))
  with check (workspace_id in (select private.my_workspace_ids(array['owner', 'agent'])));
revoke insert, update, delete on public.contact from authenticated;
grant update (tags) on public.contact to authenticated;

-- Conversaciones y mensajes: lectura para miembros; cambios por RPC o por el Telar.
create policy conversation_read on public.conversation for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy message_read on public.message for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
revoke insert, update, delete on public.conversation, public.message from authenticated;

-- Especificación del agente: los dueños crean y editan borradores; publicar es una RPC.
create policy agent_spec_read on public.agent_spec for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy agent_spec_owner_insert on public.agent_spec for insert to authenticated
  with check (workspace_id in (select private.my_workspace_ids(array['owner'])) and status = 'draft');
create policy agent_spec_owner_update on public.agent_spec for update to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner'])) and status = 'draft')
  with check (workspace_id in (select private.my_workspace_ids(array['owner'])) and status = 'draft');
create policy agent_spec_owner_delete on public.agent_spec for delete to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner'])) and status = 'draft');

-- Catálogo y preguntas frecuentes.
create policy knowledge_read on public.knowledge_chunk for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy knowledge_owner_insert on public.knowledge_chunk for insert to authenticated
  with check (workspace_id in (select private.my_workspace_ids(array['owner'])));
create policy knowledge_owner_update on public.knowledge_chunk for update to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner'])))
  with check (workspace_id in (select private.my_workspace_ids(array['owner'])));
create policy knowledge_owner_delete on public.knowledge_chunk for delete to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner'])));

-- Oportunidades y pases a humano.
create policy lead_read on public.lead for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy lead_staff_update on public.lead for update to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner', 'agent'])))
  with check (workspace_id in (select private.my_workspace_ids(array['owner', 'agent'])));
revoke insert, update, delete on public.lead from authenticated;
grant update (status, estimated_value, currency) on public.lead to authenticated;

create policy handoff_read on public.handoff for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
revoke insert, update, delete on public.handoff from authenticated;

-- Laboratorio de contratos: dueños y agentes.
create policy contract_read on public.contract for select to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner', 'agent'])));
create policy contract_sample_read on public.contract_sample for select to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner', 'agent'])));
create policy contract_alert_read on public.contract_alert for select to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner', 'agent'])));
revoke insert, update, delete on public.contract, public.contract_sample, public.contract_alert from authenticated;

-- Uso y auditoría: solo dueños.
create policy usage_owner_read on public.usage_daily for select to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner'])));
create policy audit_owner_read on public.audit_log for select to authenticated
  using (workspace_id in (select private.my_workspace_ids(array['owner'])));
revoke insert, update, delete on public.usage_daily, public.audit_log, public.plan from authenticated;
revoke insert, update, delete on public.member, public.credential, public.workspace from authenticated;
grant update (name, industry, timezone) on public.workspace to authenticated;

-- Tokens de dispositivo: cada persona ve y borra solo los suyos.
create policy device_token_own_read on public.device_token for select to authenticated
  using (user_id = (select auth.uid()));
create policy device_token_own_delete on public.device_token for delete to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update on public.device_token from authenticated;

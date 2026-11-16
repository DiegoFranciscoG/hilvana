-- Colas durables por espacio (pgmq, #3) y límites por espacio (T-10).
-- Cada espacio tiene su propia cola: un espacio saturado no adelanta ni retrasa a otro.
-- El Telar nunca toca pgmq directamente; usa estas funciones, que respetan el espacio fijado.

create or replace function private.ensure_workspace_queue(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue text := private.queue_name(p_workspace_id);
begin
  if not exists (select 1 from pgmq.list_queues() q where q.queue_name = v_queue) then
    perform pgmq.create(v_queue);
  end if;
end
$$;

create or replace function private.on_workspace_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_workspace_queue(new.id);
  return new;
end
$$;
create trigger workspace_queue_create after insert on public.workspace
  for each row execute function private.on_workspace_created();

create or replace function private.on_workspace_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue text := private.queue_name(old.id);
begin
  if exists (select 1 from pgmq.list_queues() q where q.queue_name = v_queue) then
    perform pgmq.drop_queue(v_queue);
  end if;
  return old;
end
$$;
create trigger workspace_queue_drop after delete on public.workspace
  for each row execute function private.on_workspace_deleted();

-- Despertar el drenado en la nube: si el despliegue configuró una URL (private.setting
-- 'drain_url') y un secreto en Vault ('hilvana_drain_token'), pg_net hace la llamada
-- cuando la transacción confirma. En local no hay URL y no pasa nada.
create or replace function private.wake_drain(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  select s.value into v_url from private.setting s where s.key = 'drain_url';
  if v_url is null then
    return;
  end if;
  select ds.decrypted_secret into v_token from vault.decrypted_secrets ds where ds.name = 'hilvana_drain_token';
  if v_token is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('workspaceId', p_workspace_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    timeout_milliseconds := 2000
  );
end
$$;
revoke execute on function private.wake_drain(uuid) from public, anon, authenticated;
grant execute on function private.wake_drain(uuid) to hilvana_telar;

-- Encolar un webhook verificado. Lo usa el Telar antes de fijar el espacio (la credencial
-- de la URL ya dijo a qué espacio pertenece), por eso recibe el espacio como parámetro.
create or replace function private.telar_enqueue(p_workspace_id uuid, p_message jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from public.workspace w where w.id = p_workspace_id) then
    raise exception 'unknown workspace' using errcode = 'P0002';
  end if;
  select s into v_id from pgmq.send(private.queue_name(p_workspace_id), p_message) as s;
  perform private.wake_drain(p_workspace_id);
  return v_id;
end
$$;
revoke execute on function private.telar_enqueue(uuid, jsonb) from public, anon, authenticated;
grant execute on function private.telar_enqueue(uuid, jsonb) to hilvana_telar;

-- Leer, confirmar y posponer mensajes de la cola del espacio fijado.
create or replace function private.telar_read(p_qty integer, p_visibility_seconds integer)
returns table (msg_id bigint, read_ct integer, enqueued_at timestamptz, message jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid := private.current_workspace_id();
begin
  if v_workspace is null then
    raise exception 'workspace context required' using errcode = '42501';
  end if;
  if p_qty < 1 or p_qty > 100 or p_visibility_seconds < 1 or p_visibility_seconds > 3600 then
    raise exception 'invalid read parameters' using errcode = '22023';
  end if;
  return query
    select r.msg_id, r.read_ct, r.enqueued_at, r.message
    from pgmq.read(private.queue_name(v_workspace), p_visibility_seconds, p_qty) r;
end
$$;
revoke execute on function private.telar_read(integer, integer) from public, anon, authenticated;
grant execute on function private.telar_read(integer, integer) to hilvana_telar;

-- Confirmar borra el mensaje (no se archiva: el cuerpo del webhook trae datos personales).
create or replace function private.telar_ack(p_msg_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid := private.current_workspace_id();
begin
  if v_workspace is null then
    raise exception 'workspace context required' using errcode = '42501';
  end if;
  return pgmq.delete(private.queue_name(v_workspace), p_msg_id);
end
$$;
revoke execute on function private.telar_ack(bigint) from public, anon, authenticated;
grant execute on function private.telar_ack(bigint) to hilvana_telar;

create or replace function private.telar_defer(p_msg_id bigint, p_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid := private.current_workspace_id();
begin
  if v_workspace is null then
    raise exception 'workspace context required' using errcode = '42501';
  end if;
  perform pgmq.set_vt(private.queue_name(v_workspace), p_msg_id, greatest(1, least(p_seconds, 3600)));
end
$$;
revoke execute on function private.telar_defer(bigint, integer) from public, anon, authenticated;
grant execute on function private.telar_defer(bigint, integer) to hilvana_telar;

-- Espacios con mensajes visibles: el trabajador los recorre por turnos.
create or replace function private.telar_pending_workspaces()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_visible boolean;
begin
  for v_workspace in select w.id from public.workspace w order by w.id loop
    execute format('select exists (select 1 from pgmq.%I where vt <= clock_timestamp())',
                   'q_' || private.queue_name(v_workspace))
      into v_visible;
    if v_visible then
      return next v_workspace;
    end if;
  end loop;
end
$$;
revoke execute on function private.telar_pending_workspaces() from public, anon, authenticated;
grant execute on function private.telar_pending_workspaces() to hilvana_telar;

-- Cubeta de tokens por espacio: capacidad = mensajes por minuto del plan, recarga continua.
create or replace function private.telar_take_tokens(p_count integer default 1)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid := private.current_workspace_id();
  v_rate numeric;
  v_tokens numeric;
  v_updated timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if v_workspace is null then
    raise exception 'workspace context required' using errcode = '42501';
  end if;
  select p.messages_per_minute into v_rate
  from public.workspace w join public.plan p on p.code = w.plan_code
  where w.id = v_workspace;

  insert into private.rate_bucket (workspace_id, tokens, updated_at)
  values (v_workspace, v_rate, v_now)
  on conflict (workspace_id) do nothing;

  select b.tokens, b.updated_at into v_tokens, v_updated
  from private.rate_bucket b where b.workspace_id = v_workspace for update;

  v_tokens := least(v_rate, v_tokens + extract(epoch from (v_now - v_updated)) * v_rate / 60.0);
  if v_tokens >= p_count then
    update private.rate_bucket set tokens = v_tokens - p_count, updated_at = v_now where workspace_id = v_workspace;
    return true;
  end if;
  update private.rate_bucket set tokens = v_tokens, updated_at = v_now where workspace_id = v_workspace;
  return false;
end
$$;
revoke execute on function private.telar_take_tokens(integer) from public, anon, authenticated;
grant execute on function private.telar_take_tokens(integer) to hilvana_telar;

-- Presupuesto de IA del día y del mes para el espacio fijado.
create or replace function private.telar_ai_budget()
returns table (tokens_left bigint, spend_left_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    greatest(0, p.ai_tokens_per_day - coalesce((
      select u.ai_input_tokens + u.ai_output_tokens from public.usage_daily u
      where u.workspace_id = w.id and u.day = (now() at time zone w.timezone)::date
    ), 0))::bigint,
    greatest(0, p.monthly_spend_cap_usd - coalesce((
      select sum(u.ai_cost_usd + u.meta_cost_usd) from public.usage_daily u
      where u.workspace_id = w.id
        and u.day >= date_trunc('month', now() at time zone w.timezone)::date
    ), 0))
  from public.workspace w join public.plan p on p.code = w.plan_code
  where w.id = private.current_workspace_id()
$$;
revoke execute on function private.telar_ai_budget() from public, anon, authenticated;
grant execute on function private.telar_ai_budget() to hilvana_telar;

-- Deduplicación de entregas (Shopify X-Shopify-Webhook-Id, #32). Devuelve false si ya se vio.
create or replace function private.telar_mark_delivery(p_provider text, p_delivery_id text, p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.webhook_receipt (provider, delivery_id, workspace_id)
  values (p_provider, p_delivery_id, p_workspace_id)
  on conflict do nothing;
  return found;
end
$$;
revoke execute on function private.telar_mark_delivery(text, text, uuid) from public, anon, authenticated;
grant execute on function private.telar_mark_delivery(text, text, uuid) to hilvana_telar;

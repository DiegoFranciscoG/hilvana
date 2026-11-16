-- Claves de cada espacio en Supabase Vault (#4, T-04).
-- El JSON secreto entra por store_credential(), queda cifrado en vault.secrets y solo
-- vuelve a salir por private.telar_credential_secret(), para el espacio fijado en la transacción.

-- Forma mínima del secreto por proveedor. Los nombres de campo viven aquí y en
-- telar/connectors/*/credentials.ts; nunca se guardan en public_config.
create or replace function private.assert_secret_shape(p_provider text, p_secret jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_required text[];
  v_key text;
begin
  if p_secret is null or jsonb_typeof(p_secret) <> 'object' then
    raise exception 'secret must be a JSON object' using errcode = '22023';
  end if;
  v_required := case p_provider
    when 'meta' then array['appSecret', 'accessToken', 'verifyToken']
    when 'shopify' then array['clientSecret', 'accessToken']
    when 'ai' then array['apiKey']
    else null
  end;
  if v_required is null then
    raise exception 'unknown provider %', p_provider using errcode = '22023';
  end if;
  foreach v_key in array v_required loop
    if jsonb_typeof(p_secret -> v_key) is distinct from 'string'
       or char_length(p_secret ->> v_key) < 8 or char_length(p_secret ->> v_key) > 4096 then
      raise exception 'secret field % is missing or invalid', v_key using errcode = '22023';
    end if;
  end loop;
end
$$;

create or replace function private.insert_credential(
  p_workspace_id uuid,
  p_provider text,
  p_label text,
  p_secret jsonb,
  p_public_config jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_secret_id uuid;
begin
  perform private.assert_secret_shape(p_provider, p_secret);
  v_secret_id := vault.create_secret(
    p_secret::text,
    'hilvana_credential_' || replace(v_id::text, '-', ''),
    'Credencial ' || p_provider || ' del espacio ' || p_workspace_id::text
  );
  insert into public.credential (id, workspace_id, provider, label, secret_id, public_config, created_by)
  values (v_id, p_workspace_id, p_provider, btrim(p_label), v_secret_id, coalesce(p_public_config, '{}'::jsonb), p_actor);
  return v_id;
end
$$;
revoke execute on function private.insert_credential(uuid, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;

-- RPC para dueños desde la app o la API.
create or replace function public.store_credential(
  p_workspace_id uuid,
  p_provider text,
  p_label text,
  p_secret jsonb,
  p_public_config jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.member m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  ) then
    raise exception 'only workspace owners can store credentials' using errcode = '42501';
  end if;
  return private.insert_credential(p_workspace_id, p_provider, p_label, p_secret, p_public_config, (select auth.uid()));
end
$$;
revoke execute on function public.store_credential(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.store_credential(uuid, text, text, jsonb, jsonb) to authenticated;

-- Variante del operador (CLI `hilvana connect`), solo para el rol administrador de la base.
create or replace function private.store_credential_admin(
  p_workspace_id uuid,
  p_provider text,
  p_label text,
  p_secret jsonb,
  p_public_config jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.insert_credential(p_workspace_id, p_provider, p_label, p_secret, p_public_config, null)
$$;
revoke execute on function private.store_credential_admin(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;

-- Revocar: borra el secreto cifrado y deja la fila como rastro auditable.
create or replace function public.revoke_credential(p_credential_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_secret uuid;
begin
  select c.workspace_id, c.secret_id into v_workspace, v_secret
  from public.credential c where c.id = p_credential_id;
  if v_workspace is null or not exists (
    select 1 from public.member m
    where m.workspace_id = v_workspace and m.user_id = (select auth.uid()) and m.role = 'owner'
  ) then
    raise exception 'only workspace owners can revoke credentials' using errcode = '42501';
  end if;
  delete from vault.secrets s where s.id = v_secret;
  update public.credential set status = 'revoked', rotated_at = now() where id = p_credential_id;
  update public.channel set status = 'paused' where credential_id = p_credential_id;
end
$$;
revoke execute on function public.revoke_credential(uuid) from public, anon;
grant execute on function public.revoke_credential(uuid) to authenticated;

-- Al borrar una credencial (o el espacio entero) también se borra su secreto.
create or replace function private.delete_credential_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets s where s.id = old.secret_id;
  return old;
end
$$;
create trigger credential_delete_secret after delete on public.credential
  for each row execute function private.delete_credential_secret();

-- Resolución de la credencial de un webhook: cruza espacios, por eso no devuelve secretos.
create or replace function private.telar_resolve_credential(p_credential_id uuid)
returns table (workspace_id uuid, provider text, status text, public_config jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.workspace_id, c.provider, c.status, c.public_config
  from public.credential c
  where c.id = p_credential_id
$$;
revoke execute on function private.telar_resolve_credential(uuid) from public, anon, authenticated;
grant execute on function private.telar_resolve_credential(uuid) to hilvana_telar;

-- Descifrado: solo para el espacio fijado en la transacción del Telar.
create or replace function private.telar_credential_secret(p_credential_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_secret uuid;
  v_status text;
  v_plain text;
begin
  select c.workspace_id, c.secret_id, c.status into v_workspace, v_secret, v_status
  from public.credential c where c.id = p_credential_id;
  if v_workspace is null or v_workspace is distinct from private.current_workspace_id() then
    raise exception 'credential is not in the current workspace' using errcode = '42501';
  end if;
  if v_status <> 'active' then
    raise exception 'credential is not active' using errcode = '22023';
  end if;
  select ds.decrypted_secret into v_plain from vault.decrypted_secrets ds where ds.id = v_secret;
  if v_plain is null then
    raise exception 'credential secret not found' using errcode = 'P0002';
  end if;
  return v_plain::jsonb;
end
$$;
revoke execute on function private.telar_credential_secret(uuid) from public, anon, authenticated;
grant execute on function private.telar_credential_secret(uuid) to hilvana_telar;

-- Proveedor de IA activo del espacio actual (sin secreto).
create or replace function private.telar_ai_credential()
returns table (credential_id uuid, public_config jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.public_config
  from public.credential c
  where c.workspace_id = private.current_workspace_id() and c.provider = 'ai' and c.status = 'active'
  order by c.created_at desc
  limit 1
$$;
revoke execute on function private.telar_ai_credential() from public, anon, authenticated;
grant execute on function private.telar_ai_credential() to hilvana_telar;

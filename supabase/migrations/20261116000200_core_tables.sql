-- Tablas del núcleo. Ver docs/modelo-datos.md para la regla y la fuente de cada restricción.
-- Las referencias entre tablas de un espacio usan llaves compuestas (id, workspace_id):
-- la base impide que un mensaje apunte a la conversación de otro espacio.

create table public.plan (
  code text primary key check (code ~ '^[a-z0-9_]{2,32}$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  messages_per_minute integer not null check (messages_per_minute > 0),
  ai_tokens_per_day integer not null check (ai_tokens_per_day >= 0),
  monthly_spend_cap_usd numeric(10, 2) not null check (monthly_spend_cap_usd >= 0),
  retention_days integer not null check (retention_days between 30 and 3650),
  created_at timestamptz not null default now()
);

create table public.workspace (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  industry text check (industry is null or char_length(industry) <= 60),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'America/Guayaquil' check (char_length(timezone) between 3 and 64),
  plan_code text not null default 'starter' references public.plan (code),
  active_agent_spec_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member (
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'agent', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index member_user_idx on public.member (user_id);

create table public.credential (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  provider text not null check (provider in ('meta', 'shopify', 'ai')),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  secret_id uuid not null unique,
  public_config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  unique (id, workspace_id),
  -- public_config es visible para los dueños: nunca debe llevar un secreto (T-04).
  constraint credential_public_config_is_object check (jsonb_typeof(public_config) = 'object'),
  constraint credential_public_config_without_secrets check (
    not (public_config ?| array[
      'secret', 'appSecret', 'app_secret', 'token', 'accessToken', 'access_token',
      'verifyToken', 'verify_token', 'apiKey', 'api_key', 'password', 'clientSecret', 'client_secret'
    ])
  )
);
create index credential_workspace_idx on public.credential (workspace_id);

create table public.channel (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  credential_id uuid not null,
  type text not null check (type in ('whatsapp', 'instagram', 'messenger', 'shopify')),
  external_id text not null check (char_length(external_id) between 1 and 128),
  display_name text check (display_name is null or char_length(display_name) <= 120),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  unique (type, external_id),
  unique (id, workspace_id),
  foreign key (credential_id, workspace_id) references public.credential (id, workspace_id)
);
create index channel_workspace_idx on public.channel (workspace_id);
create index channel_credential_idx on public.channel (credential_id);

create table public.contact (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  channel_id uuid not null,
  external_id text not null check (char_length(external_id) between 1 and 128),
  display_name text check (display_name is null or char_length(display_name) <= 120),
  consent_marketing boolean not null default false,
  consent_marketing_at timestamptz,
  consent_source text check (consent_source is null or char_length(consent_source) <= 120),
  opted_out_at timestamptz,
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel_id, external_id),
  unique (id, workspace_id),
  foreign key (channel_id, workspace_id) references public.channel (id, workspace_id) on delete cascade,
  constraint contact_consent_has_date check (not consent_marketing or consent_marketing_at is not null)
);
create index contact_workspace_idx on public.contact (workspace_id);

create table public.conversation (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  channel_id uuid not null,
  contact_id uuid not null,
  status text not null default 'agent' check (status in ('agent', 'human', 'closed')),
  assigned_to uuid references auth.users (id) on delete set null,
  window_expires_at timestamptz,
  human_window_expires_at timestamptz,
  last_message_at timestamptz not null default now(),
  last_message_preview text check (last_message_preview is null or char_length(last_message_preview) <= 160),
  unread_count integer not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (contact_id, workspace_id) references public.contact (id, workspace_id) on delete cascade,
  foreign key (channel_id, workspace_id) references public.channel (id, workspace_id) on delete cascade
);
create unique index conversation_open_per_contact_idx on public.conversation (contact_id) where status <> 'closed';
create index conversation_inbox_idx on public.conversation (workspace_id, last_message_at desc);

create table public.message (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  conversation_id uuid not null,
  channel_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  author text not null check (author in ('contact', 'agent', 'human', 'system')),
  sent_by uuid references auth.users (id) on delete set null,
  channel_message_id text check (channel_message_id is null or char_length(channel_message_id) <= 256),
  in_reply_to uuid references public.message (id) on delete set null,
  kind text not null default 'text' check (kind in (
    'text', 'image', 'audio', 'video', 'document', 'location', 'sticker',
    'reaction', 'interactive', 'template', 'unsupported'
  )),
  body text check (body is null or char_length(body) <= 4096),
  payload jsonb not null default '{}'::jsonb,
  status text not null check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'blocked')),
  error jsonb,
  cost_usd numeric(10, 6) check (cost_usd is null or cost_usd >= 0),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, workspace_id) references public.conversation (id, workspace_id) on delete cascade,
  foreign key (channel_id, workspace_id) references public.channel (id, workspace_id) on delete cascade,
  constraint message_author_matches_direction check ((direction = 'inbound') = (author = 'contact'))
);
-- T-02: un webhook repetido no crea otro mensaje y cada entrada tiene a lo sumo una respuesta automática.
create unique index message_channel_dedupe_idx on public.message (channel_id, channel_message_id)
  where channel_message_id is not null;
create unique index message_one_agent_reply_idx on public.message (in_reply_to) where author = 'agent';
create index message_conversation_idx on public.message (conversation_id, created_at);

create table public.agent_spec (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  spec_hash text not null default '' ,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (workspace_id, version),
  unique (id, workspace_id),
  constraint agent_spec_published_has_date check ((status = 'draft') = (published_at is null))
);
create unique index agent_spec_one_draft_idx on public.agent_spec (workspace_id) where status = 'draft';

alter table public.workspace
  add constraint workspace_active_agent_spec_fk
  foreign key (active_agent_spec_id) references public.agent_spec (id) on delete set null;

create table public.knowledge_chunk (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  source text not null check (source in ('catalog', 'faq', 'policy')),
  external_ref text check (external_ref is null or char_length(external_ref) <= 200),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null check (char_length(content) between 1 and 4000),
  price numeric(12, 2) check (price is null or price >= 0),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  stock integer check (stock is null or stock >= 0),
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(384),
  embedding_model text,
  fts tsvector generated always as (to_tsvector('spanish'::regconfig, title || ' ' || content)) stored,
  content_hash text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_chunk_price_has_currency check ((price is null) = (currency is null))
);
create unique index knowledge_chunk_ref_idx on public.knowledge_chunk (workspace_id, source, external_ref)
  where external_ref is not null;
create index knowledge_chunk_workspace_idx on public.knowledge_chunk (workspace_id);
create index knowledge_chunk_fts_idx on public.knowledge_chunk using gin (fts);
create index knowledge_chunk_embedding_idx on public.knowledge_chunk
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.lead (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  conversation_id uuid not null,
  contact_id uuid not null,
  interest text not null check (char_length(interest) between 1 and 500),
  estimated_value numeric(12, 2) check (estimated_value is null or estimated_value >= 0),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, workspace_id) references public.conversation (id, workspace_id) on delete cascade,
  foreign key (contact_id, workspace_id) references public.contact (id, workspace_id) on delete cascade
);
create index lead_workspace_idx on public.lead (workspace_id, created_at desc);

create table public.handoff (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  conversation_id uuid not null,
  reason text not null check (reason in (
    'requested_by_contact', 'complaint', 'low_confidence', 'guardrail', 'out_of_scope',
    'limit_reached', 'outside_hours', 'window_closed', 'error'
  )),
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  foreign key (conversation_id, workspace_id) references public.conversation (id, workspace_id) on delete cascade
);
create index handoff_workspace_idx on public.handoff (workspace_id, created_at desc);

create table public.contract (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  channel_type text not null check (channel_type in ('whatsapp', 'instagram', 'messenger', 'shopify')),
  event_key text not null check (event_key ~ '^[a-z]+(\.[a-z0-9_/-]+)+$' and char_length(event_key) <= 120),
  version integer not null check (version > 0),
  schema jsonb not null check (jsonb_typeof(schema) = 'object'),
  schema_hash text not null check (schema_hash ~ '^[0-9a-f]{64}$'),
  sample_count integer not null default 0 check (sample_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (workspace_id, event_key, version),
  unique (workspace_id, event_key, schema_hash),
  unique (id, workspace_id)
);

create table public.contract_sample (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  contract_id uuid not null,
  payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  unique (contract_id, payload_hash),
  foreign key (contract_id, workspace_id) references public.contract (id, workspace_id) on delete cascade
);

create table public.contract_alert (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  contract_id uuid not null,
  previous_contract_id uuid,
  event_key text not null,
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  summary text not null check (char_length(summary) <= 2000),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  foreign key (contract_id, workspace_id) references public.contract (id, workspace_id) on delete cascade
);
create index contract_alert_open_idx on public.contract_alert (workspace_id) where acknowledged_at is null;

create table public.usage_daily (
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  day date not null,
  messages_in integer not null default 0 check (messages_in >= 0),
  messages_out integer not null default 0 check (messages_out >= 0),
  ai_input_tokens bigint not null default 0 check (ai_input_tokens >= 0),
  ai_output_tokens bigint not null default 0 check (ai_output_tokens >= 0),
  ai_cost_usd numeric(12, 6) not null default 0 check (ai_cost_usd >= 0),
  meta_cost_usd numeric(12, 6) not null default 0 check (meta_cost_usd >= 0),
  primary key (workspace_id, day)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspace (id) on delete cascade,
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'service', 'system')),
  action text not null check (action in ('insert', 'update', 'delete', 'event')),
  entity text not null check (char_length(entity) <= 60),
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_workspace_idx on public.audit_log (workspace_id, created_at desc);

create table public.device_token (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('android', 'ios', 'web', 'linux')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index device_token_user_idx on public.device_token (user_id);

-- Tablas internas (no expuestas).
create table private.rate_bucket (
  workspace_id uuid primary key references public.workspace (id) on delete cascade,
  tokens numeric not null,
  updated_at timestamptz not null
);

create table private.webhook_receipt (
  provider text not null check (provider in ('meta', 'shopify')),
  delivery_id text not null check (char_length(delivery_id) between 1 and 200),
  workspace_id uuid references public.workspace (id) on delete cascade,
  received_at timestamptz not null default now(),
  primary key (provider, delivery_id)
);

-- Ajustes no secretos del despliegue (URL de drenado, modo). Los secretos van en Vault.
create table private.setting (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value text not null,
  updated_at timestamptz not null default now()
);

-- Disparadores de mantenimiento.
create trigger workspace_touch before update on public.workspace
  for each row execute function private.touch_updated_at();
create trigger conversation_touch before update on public.conversation
  for each row execute function private.touch_updated_at();
create trigger knowledge_chunk_touch before update on public.knowledge_chunk
  for each row execute function private.touch_updated_at();
create trigger lead_touch before update on public.lead
  for each row execute function private.touch_updated_at();

-- Huellas calculadas por la base (no se confía en el cliente).
create or replace function private.hash_agent_spec()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.spec_hash := encode(sha256(convert_to(new.spec::text, 'UTF8')), 'hex');
  return new;
end
$$;
create trigger agent_spec_hash before insert or update of spec on public.agent_spec
  for each row execute function private.hash_agent_spec();

create or replace function private.hash_knowledge_chunk()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.content_hash := encode(sha256(convert_to(
    coalesce(new.title, '') || chr(31) || coalesce(new.content, '') || chr(31) ||
    coalesce(new.price::text, '') || chr(31) || coalesce(new.currency, '') || chr(31) ||
    coalesce(new.stock::text, ''), 'UTF8')), 'hex');
  return new;
end
$$;
create trigger knowledge_chunk_hash before insert or update on public.knowledge_chunk
  for each row execute function private.hash_knowledge_chunk();

-- Las versiones publicadas del agente son inmutables; solo pueden archivarse.
-- Dentro de un borrado en cascada (eliminar el espacio) pg_trigger_depth() > 1.
create or replace function private.protect_published_spec()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and pg_trigger_depth() <= 1 then
      raise exception 'published agent specs cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status <> 'draft' then
    if new.spec is distinct from old.spec or new.version <> old.version
       or new.workspace_id <> old.workspace_id
       or not (new.status = old.status or (old.status = 'published' and new.status = 'archived')) then
      raise exception 'published agent specs are immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
create trigger agent_spec_protect before update or delete on public.agent_spec
  for each row execute function private.protect_published_spec();

-- Siempre queda al menos un dueño mientras el espacio exista.
create or replace function private.keep_one_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (
      select 1 from public.member m
      where m.workspace_id = old.workspace_id and m.role = 'owner' and m.user_id <> old.user_id
    ) then
      raise exception 'a workspace needs at least one owner' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end
$$;
create trigger member_keep_owner before update or delete on public.member
  for each row execute function private.keep_one_owner();

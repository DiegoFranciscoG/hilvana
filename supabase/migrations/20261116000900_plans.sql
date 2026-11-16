-- Planes de uso (decisión de producto, no dato externo). Los límites viven aquí y no en el
-- código: cambiar un límite es una migración nueva, revisable y versionada.
insert into public.plan (code, name, messages_per_minute, ai_tokens_per_day, monthly_spend_cap_usd, retention_days)
values
  ('local', 'Local de desarrollo', 120, 200000, 0, 365),
  ('starter', 'Inicial', 30, 100000, 20, 365),
  ('pro', 'Profesional', 120, 1000000, 200, 730)
on conflict (code) do nothing;

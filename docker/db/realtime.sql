-- Esquema interno de Supabase Realtime (lo usa el servicio realtime para sus propias tablas).
create schema if not exists _realtime;
alter schema _realtime owner to supabase_admin;

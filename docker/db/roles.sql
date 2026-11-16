-- Contraseñas de los roles de servicio de Supabase autoalojado, tomadas del entorno del contenedor.
\set pgpass `echo "$POSTGRES_PASSWORD"`

alter user authenticator with password :'pgpass';
alter user supabase_auth_admin with password :'pgpass';
alter user supabase_admin with password :'pgpass';

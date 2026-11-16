#!/usr/bin/env sh
# Aplica las migraciones de supabase/migrations que falten, en orden, y las registra en la
# misma tabla que usa la CLI de Supabase (supabase_migrations.schema_migrations).
# Conexión por variables estándar de libpq: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
set -eu
DIR="${MIGRATIONS_DIR:-$(dirname "$0")/../supabase/migrations}"
: "${PGPASSWORD:?Define PGPASSWORD}"

psql -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
SQL

for file in "$DIR"/*.sql; do
  base=$(basename "$file" .sql)
  version=${base%%_*}
  name=${base#*_}
  applied=$(echo "select 1 from supabase_migrations.schema_migrations where version = :'v';" | psql -tA -v v="$version")
  if [ "$applied" = "1" ]; then
    continue
  fi
  echo "aplicando $base"
  psql -v ON_ERROR_STOP=1 -q --single-transaction -f "$file"
  echo "insert into supabase_migrations.schema_migrations (version, name) values (:'v', :'n');" \
    | psql -v ON_ERROR_STOP=1 -q -v v="$version" -v n="$name"
done
echo "migraciones al día"

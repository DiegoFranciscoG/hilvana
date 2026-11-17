#!/usr/bin/env bash
# Pruebas pgTAP (T-03, T-04, T-11 y más) contra una base de Supabase desechable en Docker, con las
# imágenes de docker-compose.yml y el esquema de Auth aplicado. En CI se usa `supabase test db`.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1
source ./scripts/testdb-lib.sh
PG_PROVE_IMAGE="${PG_PROVE_IMAGE:-supabase/pg_prove:3.36}"
NAME="hilvana-testdb-$$"
PW="$(random_hex 24)"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

start_test_db "$NAME" "$PW"
migrate_auth "container:$NAME" localhost "$PW"

docker run --rm --network "container:$NAME" -e PGHOST=localhost -e PGUSER=postgres -e PGDATABASE=postgres \
  -e PGPASSWORD="$PW" -v "$HOST_DIR/supabase/migrations:/migrations:ro" -v "$HOST_DIR/scripts:/scripts:ro" \
  -e MIGRATIONS_DIR=/migrations --entrypoint sh "$(image_of supabase/postgres)" /scripts/db-migrate.sh

docker run --rm --network "container:$NAME" -e PGPASSWORD="$PW" -v "$HOST_DIR/supabase/tests:/tests:ro" \
  "$PG_PROVE_IMAGE" pg_prove -h localhost -U postgres -d postgres --ext .sql -r /tests

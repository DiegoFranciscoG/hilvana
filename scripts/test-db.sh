#!/usr/bin/env bash
# Pruebas pgTAP (T-03, T-04, T-11 y más) contra una base de Supabase desechable en Docker.
# Usa la misma imagen de Postgres que fija la CLI de Supabase 3.1.0. En CI se usa `supabase test db`.
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGE="${SUPABASE_POSTGRES_IMAGE:-supabase/postgres:17.11.0.018}"
PG_PROVE_IMAGE="${PG_PROVE_IMAGE:-supabase/pg_prove:3.36}"
NAME="hilvana-testdb-$$"
PW="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PW" "$IMAGE" >/dev/null
for _ in $(seq 1 90); do
  if docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1; then break; fi
  sleep 1
done
# La imagen reinicia Postgres al terminar sus scripts de arranque: esperar a que acepte consultas.
for _ in $(seq 1 90); do
  if docker exec -e PGPASSWORD="$PW" "$NAME" psql -h localhost -U postgres -tAc 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done

docker run --rm --network "container:$NAME" -e PGHOST=localhost -e PGUSER=postgres -e PGDATABASE=postgres \
  -e PGPASSWORD="$PW" -v "$HOST_DIR/supabase/migrations:/migrations:ro" -v "$HOST_DIR/scripts:/scripts:ro" \
  -e MIGRATIONS_DIR=/migrations --entrypoint sh "$IMAGE" /scripts/db-migrate.sh

docker run --rm --network "container:$NAME" -e PGPASSWORD="$PW" -v "$HOST_DIR/supabase/tests:/tests:ro" \
  "$PG_PROVE_IMAGE" pg_prove -h localhost -U postgres -d postgres --ext .sql -r /tests

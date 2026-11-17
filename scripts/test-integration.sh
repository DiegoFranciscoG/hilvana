#!/usr/bin/env bash
# Pruebas de integración del Telar (T-01, T-02, T-07, T-10, T-11) contra Postgres de Supabase en Docker.
# Levanta una base desechable con el esquema de Auth, aplica migraciones, habilita el rol del Telar y
# corre deno test en un contenedor de Deno en la misma red. Nada queda corriendo al terminar.
set -euo pipefail
cd "$(dirname "$0")/.."
source ./toolchain.env
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1
source ./scripts/testdb-lib.sh
NET="hilvana-it-$$"
DB="hilvana-it-db-$$"
ADMIN_PW="$(random_hex 24)"
TELAR_PW="$(random_hex 24)"

cleanup() { docker rm -f "$DB" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker network create "$NET" >/dev/null
start_test_db "$DB" "$ADMIN_PW" --network "$NET"
migrate_auth "$NET" "$DB" "$ADMIN_PW"

docker run --rm --network "$NET" -e PGHOST="$DB" -e PGUSER=postgres -e PGDATABASE=postgres -e PGPASSWORD="$ADMIN_PW" \
  -e TELAR_DB_PASSWORD="$TELAR_PW" -e MIGRATIONS_DIR=/migrations \
  -v "$HOST_DIR/supabase/migrations:/migrations:ro" -v "$HOST_DIR/scripts:/scripts:ro" \
  --entrypoint sh "$(image_of supabase/postgres)" -c '/scripts/db-migrate.sh && /scripts/db-bootstrap.sh'

docker run --rm --network "$NET" -v "$HOST_DIR:/app" -w /app -v hilvana-deno-cache:/deno-dir -e DENO_DIR=/deno-dir \
  -e HILVANA_TEST_DB_HOST="$DB" -e HILVANA_TEST_ADMIN_PASSWORD="$ADMIN_PW" -e HILVANA_TEST_TELAR_PASSWORD="$TELAR_PW" \
  "denoland/deno:${DENO_VERSION}" test --allow-read --allow-env --allow-net "${@:-telar/tests/integration}"

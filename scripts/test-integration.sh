#!/usr/bin/env bash
# Pruebas de integración del Telar (T-01, T-02, T-07, T-10, T-11) contra Postgres de Supabase en Docker.
# Levanta una base desechable, aplica migraciones, habilita el rol del Telar y corre deno test en
# un contenedor de Deno en la misma red. Nada queda corriendo al terminar.
set -euo pipefail
cd "$(dirname "$0")/.."
source ./toolchain.env
IMAGE="${SUPABASE_POSTGRES_IMAGE:-supabase/postgres:17.11.0.018}"
NET="hilvana-it-$$"
DB="hilvana-it-db-$$"
ADMIN_PW="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
TELAR_PW="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

cleanup() { docker rm -f "$DB" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD="$ADMIN_PW" "$IMAGE" >/dev/null
for _ in $(seq 1 120); do
  if docker exec -e PGPASSWORD="$ADMIN_PW" "$DB" psql -h localhost -U postgres -tAc 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done

docker run --rm --network "$NET" -e PGHOST="$DB" -e PGUSER=postgres -e PGDATABASE=postgres -e PGPASSWORD="$ADMIN_PW" \
  -e TELAR_DB_PASSWORD="$TELAR_PW" -e MIGRATIONS_DIR=/migrations \
  -v "$HOST_DIR/supabase/migrations:/migrations:ro" -v "$HOST_DIR/scripts:/scripts:ro" \
  --entrypoint sh "$IMAGE" -c '/scripts/db-migrate.sh && /scripts/db-bootstrap.sh'

docker run --rm --network "$NET" -v "$HOST_DIR:/app" -w /app -v hilvana-deno-cache:/deno-dir -e DENO_DIR=/deno-dir \
  -e HILVANA_TEST_DB_HOST="$DB" -e HILVANA_TEST_ADMIN_PASSWORD="$ADMIN_PW" -e HILVANA_TEST_TELAR_PASSWORD="$TELAR_PW" \
  "denoland/deno:${DENO_VERSION}" test --allow-read --allow-env --allow-net "${@:-telar/tests/integration}"

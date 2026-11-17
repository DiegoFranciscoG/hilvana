#!/usr/bin/env bash
# T-12: en un Linux limpio con Nix y Docker, un solo comando deja todo funcionando.
# Se usa en CI (runner Ubuntu recién creado) y sirve para probarlo a mano en una máquina nueva.
set -euo pipefail
cd "$(dirname "$0")/.."

nix --extra-experimental-features 'nix-command flakes' develop --command deno task cli up

echo "Comprobaciones de humo:"
curl -fsS http://localhost:8000/healthz
curl -fsS http://localhost:8000/telar/readyz
curl -fsS http://localhost:8000/config.json | jq -e '.supabaseUrl and .supabaseAnonKey and .telarUrl' >/dev/null
curl -fsS http://localhost:8000/auth/v1/health >/dev/null

# Inicio de sesión real con el usuario de demo y lectura de la bandeja por la API REST (RLS).
docker compose wait seed >/dev/null
set -a; source .env; set +a
TOKEN=$(curl -fsS -X POST 'http://localhost:8000/auth/v1/token?grant_type=password' \
  -H "apikey: ${HILVANA_ANON_KEY}" -H 'Content-Type: application/json' \
  -d "{\"email\":\"demo@hilvana.test\",\"password\":\"${HILVANA_DEMO_PASSWORD}\"}" | jq -r .access_token)
COUNT=$(curl -fsS 'http://localhost:8000/rest/v1/workspace?select=slug' -H "apikey: ${HILVANA_ANON_KEY}" -H "Authorization: Bearer ${TOKEN}" | jq length)
test "$COUNT" -ge 1
echo "T-12 en verde: la demo ve $COUNT espacios propios."

docker compose down --volumes

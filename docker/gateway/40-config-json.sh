#!/bin/sh
# Configuración pública de la app web generada al arrancar (la clave anon es pública por diseño).
set -eu
: "${SUPABASE_ANON_KEY:?Define SUPABASE_ANON_KEY}"
PUBLIC_URL="${PUBLIC_URL:-http://localhost:8000}"
printf '{"supabaseUrl":"%s","supabaseAnonKey":"%s","telarUrl":"%s/telar"}\n' \
  "$PUBLIC_URL" "$SUPABASE_ANON_KEY" "$PUBLIC_URL" > /tmp/config.json

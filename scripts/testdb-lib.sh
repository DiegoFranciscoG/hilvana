# Funciones comunes de las pruebas con Docker (se cargan con `source`). Levantan una base de Supabase
# desechable con las mismas imágenes que docker-compose.yml y el esquema de Auth que deja GoTrue
# (auth.uid() que lee request.jwt.claims, auth.sessions), igual que en el compose, la CLI y la nube.
# Requiere HOST_DIR (ruta de la raíz del repo vista por Docker).

# Imagen fijada en docker-compose.yml para un repositorio dado (una sola fuente de versiones).
image_of() { sed -n "s|^ *image: \($1:[^ ]*\)\$|\1|p" docker-compose.yml | head -n 1; }

random_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# start_test_db NOMBRE CONTRASEÑA [opciones extra de docker run]
start_test_db() {
  local name="$1" pw="$2"
  shift 2
  docker run -d --name "$name" "$@" -e POSTGRES_PASSWORD="$pw" \
    -v "$HOST_DIR/docker/db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro" \
    "$(image_of supabase/postgres)" >/dev/null
  # Durante sus scripts de arranque la imagen solo escucha por socket local y luego reinicia
  # Postgres: la base está lista cuando acepta consultas por TCP.
  for _ in $(seq 1 120); do
    if docker exec -e PGPASSWORD="$pw" "$name" psql -h localhost -U postgres -tAc 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "la base $name no arrancó" >&2
  return 1
}

# migrate_auth RED HOST CONTRASEÑA: aplica las migraciones de Auth con la imagen del compose.
migrate_auth() {
  docker run --rm --network "$1" -e GOTRUE_DB_DRIVER=postgres \
    -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:$3@$2:5432/postgres" \
    -e API_EXTERNAL_URL=http://localhost:9999 -e GOTRUE_SITE_URL=http://localhost:3000 \
    -e GOTRUE_JWT_SECRET="$(random_hex 32)" -e GOTRUE_LOG_LEVEL=error \
    "$(image_of supabase/gotrue)" auth migrate
}

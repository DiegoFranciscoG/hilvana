#!/usr/bin/env sh
# Habilita el login del rol del Telar con la contraseña del entorno. Se ejecuta una vez por
# base (local o remota) con un usuario administrador; la contraseña nunca va en una migración.
set -eu
: "${PGPASSWORD:?Define PGPASSWORD (administrador de la base)}"
: "${TELAR_DB_PASSWORD:?Define TELAR_DB_PASSWORD}"
psql -v ON_ERROR_STOP=1 -q -v pw="$TELAR_DB_PASSWORD" <<'SQL'
alter role hilvana_telar with login password :'pw';
SQL
echo "rol hilvana_telar habilitado"

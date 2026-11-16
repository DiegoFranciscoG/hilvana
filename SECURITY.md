# Política de seguridad

## Reportar una vulnerabilidad

No abras un issue público. Escríbeme por GitHub (perfil DiegoFranciscoG) con los pasos para reproducir el
problema. Respondo en un máximo de 7 días y te aviso cuando haya una corrección publicada.

## Qué protege Hilvana

- **Claves de cada cliente** (Meta, Shopify, proveedor de IA): cifradas en Supabase Vault. Solo el rol del
  Telar puede descifrarlas, y solo las del espacio que está atendiendo en esa transacción.
- **Aislamiento entre espacios**: RLS en todas las tablas, probado con usuarios reales de Auth (T-03), y un rol
  de base de datos propio para el Telar sin `BYPASSRLS`.
- **Webhooks**: firma HMAC verificada sobre el cuerpo crudo y comparación en tiempo constante; un webhook
  repetido nunca genera dos respuestas.
- **Agente**: los precios y productos salen del catálogo, no del modelo; la salida pasa por controles antes
  de enviarse (OWASP Top 10 for LLM Applications 2025: LLM01, LLM02, LLM05, LLM06, LLM07, LLM09, LLM10).
- **Laboratorio de contratos**: teléfonos, nombres, correos y textos se anonimizan antes de guardar.
- **Secretos de la plataforma**: solo por variables de entorno (o Secret Manager en la nube). Si falta uno
  crítico, el servicio no arranca. `.env` nunca se versiona; ver `.env.example`.
- **Cadena de suministro**: versiones exactas, `deno.lock` y `pubspec.lock` versionados, imágenes con versión
  fija, gitleaks en cada push y pull request.

## Fuera de alcance

- Cuentas de Meta, Shopify o Google Cloud mal configuradas por el operador.
- Despliegues que desactiven RLS, expongan el esquema `private` o publiquen el puerto de Postgres.

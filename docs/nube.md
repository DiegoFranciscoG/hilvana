# Despliegue en Google Cloud y costos

> **Requiere cuenta de facturación con tarjeta** (docs/investigacion.md #44). Nada se crea sin que
> confirmes el plan que muestra `hilvana deploy`.

## Qué se despliega

| Servicio | Uso en Hilvana | Capa gratuita mensual (#44) |
|---|---|---|
| Cloud Run (facturación por solicitud) | Telar: webhooks, API de la bandeja y drenado | 2 M solicitudes, 180 000 vCPU-s, 360 000 GB-s |
| Artifact Registry | Imagen del Telar | 0,5 GB |
| Cloud Build | Construcción de la imagen | 2 500 min en `e2-standard-2` |
| Secret Manager | Contraseña del rol del Telar, clave secreta de Supabase, token de drenado | 6 versiones activas, 10 000 accesos |
| Supabase (fuera de Google) | Postgres, Auth, Realtime, Vault, colas | Según el plan de Supabase |
| Firebase Cloud Messaging | Avisos push | Sin costo |

Precios fuera de la capa gratuita (lectura parcial de la página oficial, S-04): Secret Manager
USD 0,06 por versión activa y mes y USD 0,03 por 10 000 accesos (#46). Las tarifas de mensajes de
WhatsApp dependen del mercado y no están cargadas (S-01): desde el 2026-10-01 los mensajes de servicio
se cobran después de 1 000 gratis por número y mes (#24).

## Por qué el trabajador no es un proceso siempre encendido

Un proceso siempre activo en Cloud Run necesita facturación por instancia y sale de la capa gratuita.
En su lugar:

1. Al encolar, `private.telar_enqueue()` llama a `net.http_post()` (pg_net) hacia
   `POST /internal/drain` con un token en Vault. La llamada sale solo si la transacción confirma.
2. Cloud Run atiende ese pedido como cualquier otro (CPU asignada mientras procesa).
3. Un `pg_cron` cada minuto repite la llamada por si alguna se perdió.

Los worker pools de Cloud Run (#47) serían la opción natural para trabajo continuo, pero no tienen capa
gratuita documentada (S-05).

## Pasos

```bash
export TELAR_DB_PASSWORD=...        # contraseña que fijaste para el rol hilvana_telar
export SUPABASE_SECRET_KEY=...      # clave secreta del proyecto de Supabase (solo servidor)
export TELAR_DRAIN_TOKEN=...        # 32+ caracteres aleatorios
deno task cli deploy --project mi-proyecto --region us-central1 \
  --supabase-url https://<ref>.supabase.co --db-host <host del pooler>
```

1. En el proyecto de Supabase: aplicar migraciones (`supabase db push`) y habilitar el rol del Telar
   con `scripts/db-bootstrap.sh` usando la conexión de administrador.
2. `hilvana deploy` muestra los pasos (APIs, repositorio, cuenta de servicio, secretos con su valor por
   stdin, Cloud Build y Cloud Run) y pide un "sí".
3. Al terminar imprime el SQL para registrar la URL de drenado, el token en Vault y el `pg_cron`.
4. En Meta, configurar la URL `https://<servicio>.run.app/webhooks/meta/<id de credencial>` con el verify
   token de esa credencial.

## Costos esperados de una demo

Con tráfico de prueba (cientos de webhooks al día) el uso queda dentro de las capas gratuitas de Cloud
Run, Artifact Registry, Cloud Build y Secret Manager. El costo real lo marcan los mensajes de WhatsApp
(según mercado y categoría) y el proveedor de IA que elija cada espacio, que tiene su propio
presupuesto diario y tope mensual en `public.plan`.

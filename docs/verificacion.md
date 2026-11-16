# Verificación (fase 1)

Revisión hecha el **2026-11-16** contra fuentes oficiales. El detalle de cada fuente está en
[investigacion.md](investigacion.md); aquí queda qué se decidió con esa información.

## a) Versiones exactas que usa el repositorio

| Pieza | Versión fijada | Fuente | Dónde se fija |
|---|---|---|---|
| Supabase CLI | 3.1.0 | #1 | `.github/workflows/ci.yml`, `cli/src/config.ts`, `flake.nix` |
| Postgres de Supabase | la que trae la CLI 3.1.0 (`supabase/postgres` 17.x) | #1, #18 | `supabase/config.toml` (`major_version = 17`) |
| Deno | 2.9.8 | #9 | `toolchain.env`, Dockerfiles, CI |
| Hono | 4.13.19 (JSR) | #12 | `deno.json` |
| postgres.js | 4.1.1 | #15 | `deno.json` |
| Zod | 4.6.7 | #15 | `deno.json` |
| SDK MCP | `@modelcontextprotocol/server` 2.4.0 | #15, #16 | `deno.json` |
| Flutter / Dart | 3.50.0 / 3.14.0 | #13 | `toolchain.env`, `docker/flutter.Dockerfile`, CI |
| supabase_flutter | 2.18.3 | #14 | `app/pubspec.yaml` |
| firebase_core / firebase_messaging | 5.1.0 / 17.0.1 | #14 | `app/pubspec.yaml` |
| go_router / flutter_svg / intl | 18.1.4 / 2.4.0 / 0.20.3 | #14 | `app/pubspec.yaml` |
| GoTrue / PostgREST / Realtime (compose) | v2.197.0 / v16.5 / v2.166.0 | #18 | `docker-compose.yml` |
| cloudflared | 2026.11.0 | #18 | `cli/src/config.ts` |
| Nix / nixpkgs | 2.35.6 / `nixos-26.05` | #18, #19 | `flake.nix` |

Diferencias con el documento del plan: **Flutter 3.50.0 + Dart 3.14.0** (no 3.44 / 3.12) y **Graph API v27.0**.

## b) Supabase en local

- Queues (`pgmq`) y Vault vienen en la imagen de Postgres de Supabase y funcionan con `supabase start` (#3, #4).
- Runtime nativo sin Docker: **experimental**, solo Linux/macOS (#2). En Windows no existe. Hilvana usa Docker por
  defecto; `hilvana up --native` lo intenta en Linux y avisa que es experimental.

## c) Meta

- Graph API **v27.0** (#20). La versión vive en `telar/config/meta.json`, no en el código.
- Webhooks: verificación GET con `hub.challenge`; firma `X-Hub-Signature-256` HMAC-SHA256 del cuerpo crudo con el
  App Secret; reintentos 36 h → el Telar responde 200 en cuanto encola y deduplica por id de mensaje (#21, #28).
- Ventanas: WhatsApp 24 h y fuera de ella solo plantillas aprobadas (#22, #23); Messenger e Instagram 24 h, y
  respuesta humana hasta 7 días con `HUMAN_AGENT` si la app tiene el permiso (#27, #29, #30).
- Precios: por mensaje; desde 2026-10-01 se cobran los mensajes de servicio, con 1 000 gratis por número y mes
  (#24). Tarifas por mercado sin cargar (S-01).
- Política de IA: el agente es específico del negocio y se identifica como automático; los datos de la plataforma
  no se usan para entrenar modelos (#25).

## d) Shopify

- Admin GraphQL **2026-10** (#31) con `read_products`, `read_inventory` y `read_orders` (#34).
- Webhooks con `X-Shopify-Hmac-SHA256` en base64 y deduplicación por `X-Shopify-Webhook-Id` (#32); los tres
  webhooks de cumplimiento implementados (#33).

## e) Tiendas

- Apple 5.1.1(v): eliminar cuenta desde la app (#37); 4.2: funcionalidad nativa (#38); Xcode 26 / SDK iOS 26 (#39).
- Google Play: eliminación en la app y por enlace web (#40), formulario de seguridad de datos (#41), API 36 (#43),
  12 testers por 14 días para cuentas personales nuevas (#42).

## f) Google Cloud

- Capa gratuita de Cloud Run por solicitud (2 M solicitudes, 180 000 vCPU-s, 360 000 GB-s), Secret Manager
  (6 versiones, 10 000 accesos), Cloud Build (2 500 min) y Artifact Registry (0,5 GB) (#44).
- **Requiere cuenta de facturación con tarjeta** (#44): nada se despliega sin confirmación expresa.
- Worker pools existen (#47) pero sin capa gratuita documentada (S-05). El despliegue por defecto drena las colas con
  una llamada interna autenticada que dispara `pg_net` al encolar, más un respaldo con `pg_cron`.

## g) Túnel para webhooks locales

- **Cloudflare Quick Tunnels**: gratis, sin cuenta, pensados para pruebas (#48). Es el túnel por defecto de
  `hilvana tunnel`. Límite de 200 solicitudes en vuelo y URL nueva en cada arranque.
- ngrok gratis como alternativa con cuenta propia (#49).

## h) Diseño

- Esquema, RLS y roles: [modelo-datos.md](modelo-datos.md).
- Formato interno de mensajes y `agent_spec`: mismas secciones de [modelo-datos.md](modelo-datos.md).
- Arquitectura y decisiones: [arquitectura.md](arquitectura.md).

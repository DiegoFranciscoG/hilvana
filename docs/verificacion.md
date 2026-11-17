# Verificación (fase 1)

Revisión hecha el **2026-11-16** contra fuentes oficiales y el **2026-11-17** con Docker (sección i). El detalle de cada fuente está en
[investigacion.md](investigacion.md); aquí queda qué se decidió con esa información.

## a) Versiones exactas que usa el repositorio

| Pieza | Versión fijada | Fuente | Dónde se fija |
|---|---|---|---|
| Supabase CLI | 3.1.0 | #1 | `toolchain.env`, `.github/workflows/ci.yml` (en el entorno Nix, por `npx supabase@3.1.0`: nixpkgs trae la 2.111.0) |
| Postgres de Supabase | `supabase/postgres` 17.11.0.018, la que fija la CLI 3.1.0 | #1, #56 | `docker-compose.yml`, `supabase/config.toml` |
| Deno | 2.9.8 | #9 | `toolchain.env`, Dockerfiles, CI |
| Hono | 4.13.18 (JSR; la 4.13.19 salió el mismo día y Deno exige 24 h de antigüedad) | #12 | `deno.json` |
| postgres.js | 4.1.1 | #15 | `deno.json` |
| Zod | 4.6.7 | #15 | `deno.json` |
| SDK MCP | `@modelcontextprotocol/server` 2.4.0 | #15, #16 | `deno.json` |
| Flutter / Dart | 3.50.0 / 3.14.0 | #13 | `toolchain.env`, `docker/web.Dockerfile`, CI |
| supabase_flutter | 2.18.3 | #14 | `app/pubspec.yaml` |
| firebase_core / firebase_messaging | 5.1.0 / 17.0.1 (registro por FID) | #14, #57, #58 | `app/pubspec.yaml` |
| go_router / flutter_svg / intl | 18.1.4 / 2.4.0 / 0.20.3 | #14 | `app/pubspec.yaml`, `app/pubspec.lock` |
| material_ui / shared_preferences | 1.11.0 / 2.5.6 | #59 | `app/pubspec.yaml` |
| GoTrue / PostgREST / Realtime (compose) | v2.197.0 / v16.5 / v2.154.0, las que fija la CLI 3.1.0 | #56 | `docker-compose.yml` |
| pg_prove (pruebas pgTAP locales) | 3.36, la que usa la CLI 3.1.0 | #56 | `scripts/test-db.sh` |
| astral (capturas) | 0.5.6 | #60 | `deno.json`, `deno.lock` |
| cloudflared | 2026.11.0 | #18 | `toolchain.env` |
| Nix / nixpkgs | 2.35.6 / `nixos-26.05` + `nixos-unstable` (revisiones en `flake.lock`) | #18, #19 | `flake.nix`, `flake.lock` |

Diferencias con el documento del plan: **Flutter 3.50.0 + Dart 3.14.0** (no 3.44 / 3.12) y **Graph API v27.0**.

## b) Supabase en local

- Queues (`pgmq`) y Vault vienen en la imagen de Postgres de Supabase y funcionan con `supabase start` (#3, #4).
- Runtime nativo sin Docker: **experimental**, solo Linux/macOS (#2). En Windows no existe. Hilvana usa Docker en
  todos los sistemas y no ofrece el modo nativo mientras siga siendo experimental.

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

## i) Verificación con Docker (2026-11-17)

| Qué | Resultado |
|---|---|
| Migraciones en `supabase/postgres` 17.11.0.018 | Aplican sin error. Las pruebas corren sobre el esquema que deja `auth migrate` de GoTrue v2.197.0, como la CLI (#56). |
| pgTAP (`scripts/test-db.sh`) | 77 pruebas en 7 archivos, en verde. |
| Integración del Telar (`scripts/test-integration.sh`) | 9 pruebas en verde: T-01, T-02, T-07, T-10, T-11, laboratorio y aislamiento del rol. |
| Deno 2.9.8 | `check`, `lint`, `fmt`, 68 pruebas (84,9 % de líneas) y evaluación 50/50. |
| App Flutter 3.50.0 | `pub get` con lockfile, `analyze` sin observaciones, 10 pruebas, `build web` y `build linux` correctos. |
| Stack completo (`docker compose up --build`, `deno task cli up`) | Todos los servicios sanos; login real de la demo, RLS (la agente solo ve su espacio y ninguna credencial) y 401 sin sesión. |
| Nix | `flake.lock` con `nixos-26.05` (2026-11-15) y `nixos-unstable` (2026-11-13); `nix develop` entrega Deno 2.9.8, Node 24, psql 17.12, gitleaks 8.30.1, cloudflared 2026.10.7 y jq 1.8.2. |
| Capturas | `docker compose --profile tools run --rm screenshots` → `docs/img/`. |

Errores reales que la verificación encontró y se corrigieron (cada uno con su commit `fix`): auditoría al
borrar un espacio (cascada), variables de compose pisadas por el entorno de la shell (#63), permisos de
entorno de Deno para postgres.js, Auth y migraciones en paralelo, permiso de Internet en Android de
publicación, API de avisos push deprecada (#57, #58) y diseño en teléfonos angostos.

Sin verificar aquí: compilación de Android (sin SDK) e iOS (sin macOS), avisos push reales (sin proyecto de
Firebase) y el job T-12 completo en un Linux limpio, que corre en la CI.

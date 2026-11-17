# Investigación y fuentes

Consulta hecha el **2026-11-16**. Cada regla de negocio del código cita el número de fila de esta tabla
(por ejemplo `[#18]`). Cuando una fuente oficial no se pudo leer completa, la fila lo dice y la regla
queda en la sección de **Supuestos**. Si dos fuentes se contradicen, gana la oficial y más reciente.

## Plataforma y versiones

| # | Fuente (oficial / confiable) | URL | Consultada | Qué se tomó de aquí |
|---|---|---|---|---|
| 1 | Supabase CLI — releases (GitHub) | https://github.com/supabase/cli/releases | 2026-11-16 | Versión estable `v3.1.0` (2026-11-09); paquete npm `supabase@3.1.0`. |
| 2 | Supabase Docs — Docker and native runtimes | https://supabase.com/docs/guides/local-development/docker-and-native-runtimes | 2026-11-16 | Runtime nativo **experimental**: se activa con `[experimental] stack` y `supabase start --runtime native`; solo Linux (glibc ≥ 2.35) y macOS 14+ Apple silicon; **no Windows**; no corre como root; `supabase start` sin la opción siempre usa Docker. |
| 3 | Supabase Docs — Queues / pgmq | https://supabase.com/docs/guides/queues · https://supabase.com/docs/guides/queues/pgmq | 2026-11-16 | Entrega exactamente una vez por consumidor dentro de la ventana de visibilidad; funciones `pgmq.create/send/read/pop/archive/delete/set_vt`; `pop` da semántica "como máximo una vez". |
| 4 | Supabase Docs — Vault | https://supabase.com/docs/guides/database/vault | 2026-11-16 | `vault.create_secret()` devuelve UUID; lectura por la vista `vault.decrypted_secrets`; cifrado autenticado (libsodium), la llave no vive en la base; quien lee la vista ve el secreto → proteger con privilegios SQL. |
| 5 | Supabase Docs — Testing / pgTAP | https://supabase.com/docs/guides/local-development/testing/overview · https://supabase.com/docs/guides/database/extensions/pgtap | 2026-11-16 | `supabase test db` ejecuta pgTAP; pruebas en `supabase/tests/`; patrón `begin; plan(n); … finish(); rollback;`. |
| 6 | Supabase Docs — Row Level Security | https://supabase.com/docs/guides/database/postgres/row-level-security | 2026-11-16 | `(select auth.uid())` para cachear por sentencia; funciones `security definer` en esquema no expuesto (`private`) con `search_path = ''`; índices en columnas de políticas; políticas `to authenticated`. |
| 7 | Supabase Docs — Realtime Postgres Changes | https://supabase.com/docs/guides/realtime/postgres-changes | 2026-11-16 | Publicación `supabase_realtime`; cada cambio se autoriza con RLS por suscriptor; para muchos suscriptores se recomienda Broadcast. |
| 8 | Supabase Docs — API keys | https://supabase.com/docs/guides/api/api-keys | 2026-11-16 | Claves nuevas `sb_publishable_…` (cliente) y `sb_secret_…` (solo servidor); las JWT `anon`/`service_role` quedan obsoletas a fin de 2026; `supabase start` imprime ambas. |
| 9 | Deno — releases (GitHub) y Docker Hub `denoland/deno` | https://github.com/denoland/deno/releases · https://hub.docker.com/r/denoland/deno | 2026-11-16 | Deno `2.9.8` (2026-10-21); imágenes `denoland/deno:2.9.8` y `distroless-2.9.8`. |
| 10 | Deno Docs — Security and permissions | https://docs.deno.com/runtime/fundamentals/security/ | 2026-11-16 | `--allow-net=host`, `--allow-env=VAR`, `--allow-read=ruta`; `--deny-*` gana sobre `--allow-*`. |
| 11 | Deno Docs — `deno compile` | https://docs.deno.com/runtime/reference/cli/compile/ | 2026-11-16 | Permisos se fijan al compilar; `--target x86_64-unknown-linux-gnu` / `aarch64-unknown-linux-gnu`; `--include` para archivos extra. |
| 12 | JSR — `@hono/hono` y `@std/*` | https://jsr.io/@hono/hono | 2026-11-16 | Hono `4.13.19`; `@std/assert 1.0.19`, `@std/testing 1.0.21`, `@std/cli 1.0.32`, `@std/path 1.1.6`, `@std/fs 1.0.24`, `@std/encoding 1.0.11`. |
| 13 | Flutter — índice oficial de versiones | https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json (el mismo que usa https://docs.flutter.dev/install/archive) | 2026-11-16 | Estable actual **Flutter 3.50.0 + Dart 3.14.0** (2026-11-11), SHA-256 del tarball `6ea2d806…ff9f5`. El documento del plan decía 3.44 / Dart 3.12: ya hay una estable más nueva. |
| 14 | pub.dev | https://pub.dev | 2026-11-16 | `supabase_flutter 2.18.3`, `firebase_core 5.1.0`, `firebase_messaging 17.0.1`, `go_router 18.1.4`, `flutter_svg 2.4.0`, `intl 0.20.3`, `mocktail 1.0.5`, `flutter_lints 6.0.0`. |
| 15 | npm registry | https://registry.npmjs.org | 2026-11-16 | `@supabase/supabase-js 2.119.0`, `postgres 4.1.1` (Unlicense), `zod 4.6.7` (MIT), `@modelcontextprotocol/server 2.4.0` (Apache-2.0, SDK v2). |
| 16 | Model Context Protocol — SDK TypeScript v2 | https://www.npmjs.com/package/@modelcontextprotocol/server · https://modelcontextprotocol.io/specification/2026-07-28 | 2026-11-16 | SDK v2 reemplaza a `@modelcontextprotocol/sdk`; implementa la especificación 2026-07-28; transporte stdio en `@modelcontextprotocol/server/stdio`. |
| 17 | Agent Skills — especificación | https://agentskills.io/specification | 2026-11-16 | `SKILL.md` con `name` (1–64, minúsculas, dígitos y guiones, igual al directorio) y `description` (1–1024); opcionales `license`, `compatibility`, `metadata`, `allowed-tools`; carpetas `scripts/`, `references/`, `assets/`; cuerpo < 500 líneas. |
| 18 | Docker Hub — imágenes base | https://hub.docker.com | 2026-11-16 | `supabase/gotrue v2.197.0`, `postgrest/postgrest v16.5`, `supabase/realtime v2.166.0`, `supabase/postgres 17.x`, `nginxinc/nginx-unprivileged 1.31.7-alpine`, `cloudflare/cloudflared 2026.11.0`, `nixos/nix 2.35.6`, `supabase/pg_prove 3.36`, `debian trixie-20261104-slim`. |
| 19 | nixpkgs (GitHub) | https://github.com/NixOS/nixpkgs | 2026-11-16 | Rama estable `nixos-26.05`. |

## Meta: WhatsApp, Messenger e Instagram

| # | Fuente | URL | Consultada | Qué se tomó de aquí |
|---|---|---|---|---|
| 20 | Graph API — Changelog | https://developers.facebook.com/docs/graph-api/changelog | 2026-11-16 | Versión más nueva **v27.0** (2026-11-04); v26.0 (2026-07-29); v25.0 disponible hasta 2028-07-29. |
| 21 | Webhooks — Getting started | https://developers.facebook.com/docs/graph-api/webhooks/getting-started | 2026-11-16 | Verificación GET con `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` (devolver el challenge); POST firmado en `X-Hub-Signature-256: sha256=<hex>` con el App Secret; responder 200; reintentos durante **36 h**; deduplicar. |
| 22 | WhatsApp Cloud API — Send messages | https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages | 2026-11-16 | Ventana de atención **24 h** desde el último mensaje del cliente; fuera de ella solo plantillas aprobadas; `POST /{version}/{phone-number-id}/messages`. |
| 23 | WhatsApp — Templates overview | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview | 2026-11-16 | Cuerpo `type: "template"` con `name`, `language.code` y `components`; la plantilla debe estar `APPROVED`. |
| 24 | WhatsApp — Pricing | https://developers.facebook.com/docs/whatsapp/pricing | 2026-11-16 | Precio por mensaje desde 2025-07-01; **mensajes de servicio cobrados desde 2026-10-01**; 1 000 mensajes de servicio gratis por número y mes; tarifas en rate cards por mercado. |
| 25 | Meta Terms for WhatsApp Business Platform (antes Business Solution Terms) | https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform | 2026-11-16 | Cláusula 4.7 "Proveedores de IA": prohíbe ofrecer IA de propósito general como funcionalidad principal; permite usar un proveedor de IA como proveedor de soluciones, **sin** usar datos de la plataforma para entrenar modelos. Actualizado 2026-09-23. |
| 26 | Prensa — cambio de términos (contexto) | https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/ | 2026-11-16 | Fecha de aplicación 2026-01-15 para cuentas existentes (complementa #25; no se usa sola). |
| 27 | Messenger — Policy overview | https://developers.facebook.com/docs/messenger-platform/policy/policy-overview | 2026-11-16 | Ventana estándar **24 h**; respuestas humanas con la etiqueta Human Agent hasta **7 días**. |
| 28 | Messenger — Webhooks | https://developers.facebook.com/docs/messenger-platform/webhooks | 2026-11-16 | Forma `object/entry[].messaging[]` con `sender.id`, `recipient.id`, `timestamp`, `message.mid/text`; firma `X-Hub-Signature-256` calculada sobre el cuerpo tal como llega (unicode escapado). |
| 29 | Messenger — Send API reference | https://developers.facebook.com/docs/messenger-platform/reference/send-api | 2026-11-16 | Página leída solo parcialmente: la etiqueta `HUMAN_AGENT` exige aprobación en App Review (permiso Human Agent). |
| 30 | Instagram API with Instagram Login — Messaging | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api | 2026-11-16 | Ventana 24 h y Human Agent 7 días; `POST https://graph.instagram.com/v27.0/<IG_ID>/messages`; texto UTF-8 ≤ 1000 bytes; permisos `instagram_business_basic` e `instagram_business_manage_messages`. |

## Shopify

| # | Fuente | URL | Consultada | Qué se tomó de aquí |
|---|---|---|---|---|
| 31 | Shopify — API versioning | https://shopify.dev/docs/api/usage/versioning | 2026-11-16 | Última estable **2026-10** (soportada hasta 2027-10-16); versiones trimestrales con ≥ 12 meses de soporte. |
| 32 | Shopify — Verify webhook deliveries | https://shopify.dev/docs/apps/build/webhooks/verify-deliveries | 2026-11-16 | `X-Shopify-Hmac-SHA256` = base64(HMAC-SHA256(client secret, cuerpo crudo)); comparación en tiempo constante; deduplicar con `X-Shopify-Webhook-Id`; 5 s para responder; 8 reintentos en 4 h. |
| 33 | Shopify — Privacy law compliance | https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance | 2026-11-16 | Webhooks obligatorios `customers/data_request`, `customers/redact`, `shop/redact`; responder 2xx, cumplir en 30 días, 401 si el HMAC no es válido. |
| 34 | Shopify — Access scopes | https://shopify.dev/docs/api/usage/access-scopes | 2026-11-16 | `read_products`, `read_inventory`, `read_orders` (60 días; `read_all_orders` para más); datos protegidos de clientes requieren aprobación. |
| 35 | Shopify — GraphQL Admin rate limits | https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits | 2026-11-16 | Cubeta con costo por consulta; restauración 100 puntos/s en plan estándar; máximo 1000 puntos por consulta. |
| 36 | Shopify — Admin GraphQL API | https://shopify.dev/docs/api/admin-graphql | 2026-11-16 | `POST https://{tienda}.myshopify.com/admin/api/2026-10/graphql.json` con cabecera `X-Shopify-Access-Token`. |

## Tiendas de apps

| # | Fuente | URL | Consultada | Qué se tomó de aquí |
|---|---|---|---|---|
| 37 | Apple — Offering account deletion in your app | https://developer.apple.com/support/offering-account-deletion-in-your-app/ | 2026-11-16 | Guía 5.1.1(v): iniciar la eliminación dentro de la app, borrar la cuenta y sus datos (desactivar no basta), fácil de encontrar; si hay Sign in with Apple, revocar tokens. |
| 38 | App Review Guidelines | https://developer.apple.com/app-store/review/guidelines/ | 2026-11-16 | Guía 4.2: la app debe ir más allá de un sitio web empaquetado (funcionalidad propia). |
| 39 | Apple — Upcoming requirements | https://developer.apple.com/news/upcoming-requirements/ | 2026-11-16 | Desde 2026-04-28 se sube con Xcode 26 y SDK iOS 26; desde 2026-09-09 el mínimo de despliegue es iOS 13. |
| 40 | Google Play — Account deletion requirements | https://support.google.com/googleplay/android-developer/answer/13327111 | 2026-11-16 | Ruta de eliminación dentro de la app **y** enlace web que no exija reinstalar; borrar los datos asociados declarados. |
| 41 | Google Play — Data safety | https://support.google.com/googleplay/android-developer/answer/10787469 | 2026-11-16 | Declarar datos recolectados, si se pueden borrar (con el enlace web) y cifrado en tránsito. |
| 42 | Google Play — Testing requirements for new personal accounts | https://support.google.com/googleplay/android-developer/answer/14151465 | 2026-11-16 | Cuentas personales creadas después del 2023-11-13: prueba cerrada con ≥ 12 testers durante ≥ 14 días antes de producción. |
| 43 | Android — Target API level requirements | https://developer.android.com/google/play/requirements/target-sdk | 2026-11-16 | Desde 2026-08-31 apps nuevas y actualizaciones deben apuntar a **API 36** (Android 16). |

## Google Cloud y túneles

| # | Fuente | URL | Consultada | Qué se tomó de aquí |
|---|---|---|---|---|
| 44 | Google Cloud — Free Tier | https://docs.cloud.google.com/free/docs/free-cloud-features | 2026-11-16 | Cloud Run (facturación por solicitud): 2 M solicitudes, 360 000 GB-s, 180 000 vCPU-s al mes; Secret Manager: 6 versiones activas y 10 000 accesos; Cloud Build: 2 500 min/mes en `e2-standard-2`; Artifact Registry: 0,5 GB; **requiere cuenta de facturación** (tarjeta u otro medio). |
| 45 | Cloud Run — Pricing | https://cloud.google.com/run/pricing | 2026-11-16 | Lectura parcial (resumen del buscador sobre la página oficial): facturación por instancia con 240 000 vCPU-s y 450 000 GiB-s gratis. |
| 46 | Secret Manager — Pricing | https://cloud.google.com/secret-manager/pricing | 2026-11-16 | Lectura parcial: USD 0,06 por versión activa y mes; USD 0,03 por 10 000 accesos. |
| 47 | Cloud Run — Worker pools | https://docs.cloud.google.com/run/docs/deploy-worker-pools | 2026-11-16 | Recurso para trabajo continuo en segundo plano, sin URL ni autoescalado; la página no indica capa gratuita. |
| 48 | Cloudflare — Quick Tunnels | https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/ | 2026-11-16 | Sin cuenta ni dominio; **solo para pruebas y desarrollo**; 200 solicitudes en vuelo; sin SSE; el dominio cambia en cada túnel; `cloudflared tunnel --url http://localhost:PUERTO`. |
| 49 | ngrok — Pricing | https://ngrok.com/pricing | 2026-11-16 | Plan gratis con cuenta: 1 dominio de desarrollo, 1 GB de salida, 20 000 solicitudes HTTP. |

## Datos personales y seguridad

| # | Fuente | URL | Consultada | Qué se tomó de aquí |
|---|---|---|---|---|
| 50 | LOPDP Ecuador — Registro Oficial, Quinto Suplemento N.º 459 (2021-05-26), copia de la SPDP | https://www.spdp.gob.ec/wp-content/uploads/2026/10/02-Ley-Organica-de-Proteccion-de-Datos-Personales-2021_compressed.pdf | 2026-11-16 | Arts. 12–16: información, acceso, rectificación y eliminación atendidos en **15 días**, eliminación gratuita, oposición a mercadotecnia directa en cualquier momento; art. 17 portabilidad; art. 42 evaluación de impacto; art. 43 notificar vulneraciones a la Autoridad y a ARCOTEL en **5 días** (el encargado avisa al responsable en 2 días); art. 46 aviso al titular en **3 días**; art. 47 protección desde el diseño; arts. 55–57 transferencias internacionales con garantías adecuadas. |
| 51 | Reglamento General de la LOPDP — Decreto Ejecutivo 904, RO Tercer Suplemento 435 (2023-11-13) | https://www.spdp.gob.ec/wp-content/uploads/2026/09/03-Reglamento-General-de-la-Ley-Organica-de-Proteccion-de-Datos-Personales-2023.pdf | 2026-11-16 | Existencia y fecha del reglamento; autoridad: Superintendencia de Protección de Datos Personales (SPDP). |
| 52 | Perú — Compendio oficial de protección de datos (MINJUSDH, dic-2025) | https://cdn.www.gob.pe/uploads/document/file/9231033/7575393-compendio_proteccion_datos_personales.pdf | 2026-11-16 | Ley 29733: consentimiento previo, informado, expreso e inequívoco; Reglamento D.S. 016-2024-JUS vigente desde **2025-03-31**; art. 34.3: incidentes que afecten al titular se le comunican en **48 horas**; figura del Oficial de Datos Personales. |
| 53 | OWASP Top 10:2025 | https://top10.owasp.org/2025/ | 2026-11-16 | A01 Broken Access Control … A03 Software Supply Chain Failures … A10 Mishandling of Exceptional Conditions. |
| 54 | OWASP API Security Top 10 2023 | https://api-security.owasp.org/editions/2023/en/0x11-t10 | 2026-11-16 | API1 BOLA, API2 autenticación, API4 consumo sin límite, API7 SSRF, API10 consumo inseguro de APIs. |
| 55 | OWASP Top 10 for LLM Applications 2025 | https://genai.owasp.org/llm-top-10/ | 2026-11-16 | LLM01 Prompt Injection, LLM02 fuga de información, LLM05 manejo inseguro de la salida, LLM06 agencia excesiva, LLM07 fuga del prompt de sistema, LLM09 desinformación, LLM10 consumo sin límite. |

## Verificación con Docker (2026-11-17)

| # | Fuente | URL | Consultada | Qué se tomó de aquí |
|---|---|---|---|---|
| 56 | Supabase CLI 3.1.0 — `apps/cli/src/shared/services/Dockerfile` y `commands/db/start/SIDE_EFFECTS.md` | https://github.com/supabase/cli/tree/v3.1.0/apps/cli/src | 2026-11-17 | Imágenes que fija la CLI: postgres 17.11.0.018, gotrue v2.197.0, postgrest v16.5, realtime v2.154.0, pg_prove 3.36. `db start` corre las migraciones de Auth, Storage y Realtime en un volumen nuevo. |
| 57 | Firebase — Get started with Firebase Cloud Messaging in Flutter apps | https://firebase.google.com/docs/cloud-messaging/flutter/get-started | 2026-11-17 | Registro por ID de instalación (FID) con `register()` y `onRegistered` (escuchar antes); activación `firebase_messaging_installation_id_enabled` / `FirebaseMessagingInstallationIdEnabled`; apagar la inicialización automática; no mezclar con las API de token. |
| 58 | Firebase — FCM REST API v1, recurso `projects.messages` | https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages | 2026-11-17 | Campo `fid`; `token` deprecado (en la transición acepta un FID). |
| 59 | pub.dev — `material_ui` (editor verificado flutter.dev) y `go_router` 18.1.4 | https://pub.dev/packages/material_ui | 2026-11-17 | `package:flutter/material.dart` deprecado desde Flutter 3.47; `material_ui` es una copia propia de Material y `go_router` 18 ya la usa. |
| 60 | JSR — `@astral/astral` | https://jsr.io/@astral/astral | 2026-11-17 | Control de Chromium sin interfaz para las capturas (0.5.6). |
| 61 | supabase/auth v2.197.0 — `internal/conf/configuration.go` | https://github.com/supabase/auth/blob/v2.197.0/internal/conf/configuration.go | 2026-11-17 | HS256 con los bytes crudos de `GOTRUE_JWT_SECRET`; roles de administración por defecto `service_role` y `supabase_admin`. |
| 62 | PostgREST — Configuration | https://docs.postgrest.org/en/latest/references/configuration.html | 2026-11-17 | `db-use-legacy-gucs` ya no existe (se quitó del compose); `request.jwt.claims` es la única variable de claims. |
| 63 | Docker Docs — Compose: variable interpolation | https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/ | 2026-11-17 | Precedencia: entorno de la shell, luego `--env-file`, luego `.env` → prefijo `HILVANA_` en lo que interpola el compose. |

## Supuestos (no verificados del todo)

Estas reglas se usan con cuidado: están en archivos de datos versionados (no quemadas en el código) para
corregirlas sin tocar la lógica.

- **S-01 Tarifas de WhatsApp por mercado** — no se leyeron los rate cards (#24). `cost_usd` queda vacío
  hasta que el operador cargue la tarifa oficial en `telar/config/whatsapp-pricing.json`.
- **S-02 `HUMAN_AGENT`** — la exigencia de App Review sale de una lectura parcial (#29). Por eso la etiqueta
  solo se usa si la credencial declara `humanAgentApproved: true`.
- **S-03 Forma exacta de webhooks de Instagram y de estados de WhatsApp** — los ejemplos del repositorio son
  sintéticos según la forma documentada; el laboratorio de contratos aprende la forma real del tráfico propio.
- **S-04 Precios de Cloud Run por instancia y de Secret Manager** — lectura parcial (#45, #46). El
  despliegue por defecto usa facturación por solicitud, cubierta por #44.
- **S-05 Capa gratuita de worker pools** — no documentada (#47); no se usan en el despliegue por defecto.
- **S-06 Versión exacta que introdujo el runtime nativo** — la página (#2) no la indica; la fuente secundaria
  menciona CLI 2.119.0. No afecta: Hilvana usa Docker y no ofrece el modo nativo.
- **S-07 Exención de cuentas de organización en Google Play** — la regla de 12 testers (#42) aplica a cuentas
  personales; la página no menciona organizaciones de forma explícita.

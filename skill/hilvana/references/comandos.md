# Comandos de `hilvana`

| Comando | Qué hace | Efectos |
|---|---|---|
| `init` | Crea o completa `.env` con secretos aleatorios (contraseñas, `HILVANA_JWT_SECRET`, claves anon y service_role firmadas con él). | Escribe `.env` (permisos 600). No sobrescribe valores existentes ni los imprime. |
| `up [--no-build]` | `init` + `docker compose up -d --build` + espera a que el Telar responda. | Levanta base, Auth, API REST, Realtime, pasarela web, Telar, trabajador y datos de demo. |
| `down [--volumes]` | Detiene los servicios. | Con `--volumes` borra la base local. |
| `status` | `docker compose ps` y salud del Telar. | Ninguno. |
| `tunnel [--port 8000]` | Abre un Cloudflare Quick Tunnel hacia la pasarela local y lista las URLs de callback por credencial. | Expone la máquina a internet mientras está abierto; solo para pruebas. |
| `space list` | Espacios, credenciales (id y estado) y canales. | Ninguno. |
| `space create <nombre> --slug --country [--plan]` | Crea un espacio. | Inserta en la base local. |
| `connect <meta\|shopify\|ai> --space --label [--channel --external-id] [--public '<json>']` | Guarda el secreto (JSON por stdin) en Vault y, si se indica, crea el canal. | Inserta credencial y canal. |
| `contracts [--space] [--alerts]` | Contratos inferidos o alertas de deriva abiertas. | Ninguno. |
| `deploy --project --region --supabase-url --db-host [--tag] [--yes]` | Muestra el plan de Cloud Run, Artifact Registry, Cloud Build y Secret Manager y lo ejecuta tras confirmar. | Crea recursos facturables en Google Cloud. |

## Formato de los secretos (stdin)

- Meta: `{"appSecret": "…", "accessToken": "…", "verifyToken": "…"}`
- Shopify: `{"clientSecret": "…", "accessToken": "…"}` y `--public '{"currency":"USD","shopDomain":"tienda.myshopify.com"}'`
- Proveedor de IA compatible con chat completions: `{"apiKey": "…"}` y `--public '{"baseUrl":"https://…/v1","model":"…"}'`

## Configuración pública útil

- `humanAgentApproved: true` en la credencial de Meta solo si la app tiene aprobado el permiso
  Human Agent; habilita respuestas humanas hasta 7 días en Messenger e Instagram.

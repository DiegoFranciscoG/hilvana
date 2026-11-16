---
name: hilvana
description: Opera una instalación de Hilvana, la base abierta para atender clientes por WhatsApp, Instagram, Messenger y Shopify. Úsala para levantar el entorno local, crear espacios, conectar canales, revisar contratos y alertas de webhooks, probar el agente y preparar el despliegue en Google Cloud con la CLI `hilvana`.
license: AGPL-3.0-or-later
compatibility: Requiere Deno 2.9 y Docker. El despliegue requiere gcloud y una cuenta de facturación de Google Cloud.
metadata:
  version: "0.1.0"
  repository: hilvana
---

# Hilvana

Hilvana une en una sola bandeja los mensajes que llegan por canales oficiales. Cada negocio es un
**espacio** aislado (RLS en Postgres, claves en Supabase Vault, cola propia). Esta habilidad describe
cómo operarlo con la CLI `hilvana` (o `deno task cli …` dentro del repositorio) y con el servidor MCP.

## Reglas que no se negocian

1. **Nunca pidas secretos en el chat.** Tokens de Meta, Shopify o de un proveedor de IA se cargan en
   la terminal de la persona con `hilvana connect … < secreto.json`, que los guarda cifrados en Vault.
2. **Solo APIs oficiales**: WhatsApp Cloud API, Messenger Platform, Instagram Messaging y Shopify
   Admin GraphQL. No uses ni sugieras librerías que imiten WhatsApp Web.
3. **Nada se despliega sin confirmación.** `hilvana deploy` muestra el plan y espera un "sí" explícito.
   Google Cloud exige una cuenta de facturación: avísalo antes de proponer el despliegue.
4. Los datos de clientes no salen del entorno: no copies mensajes ni teléfonos en tus respuestas.

## Tareas frecuentes

| Quiero… | Comando |
|---|---|
| Levantar todo en local con datos de demo | `hilvana up` (crea `.env` con secretos aleatorios si falta) |
| Ver el estado | `hilvana status` |
| Recibir webhooks reales en local | `hilvana tunnel` (Cloudflare Quick Tunnel, solo pruebas) |
| Crear un espacio | `hilvana space create "Panadería" --slug panaderia --country EC` |
| Conectar WhatsApp | `hilvana connect meta --space panaderia --label "WhatsApp" --channel whatsapp --external-id <phone_number_id> < meta.json` |
| Ver contratos y deriva | `hilvana contracts --space panaderia` y `hilvana contracts --alerts` |
| Probar el agente | `deno task eval` (50 conversaciones con controles de salida) |
| Desplegar | `hilvana deploy --project <id> --region us-central1 --supabase-url https://… --db-host …` |

El detalle de cada comando está en [references/comandos.md](references/comandos.md) y los problemas
comunes en [references/problemas.md](references/problemas.md).

## Servidor MCP

`deno task mcp` expone herramientas de **solo lectura**: `list_workspaces`, `list_contracts`,
`drift_alerts`, `deploy_plan` y `connect_instructions`. Con `--allow-write` agrega `create_workspace`.
Ninguna herramienta acepta ni devuelve secretos.

## Cómo leer una alerta de deriva

Cada línea dice qué cambió en la forma del webhook: `+` campo nuevo, `-` ya no aparece, `~` cambió el
tipo, `?` ahora es opcional. Un campo nuevo rara vez rompe algo; un cambio de tipo en un campo que usa
un conector sí. Después de revisarla, regenera los tipos con `deno task lab types`.

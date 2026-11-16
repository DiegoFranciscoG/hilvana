# Servidor MCP y Agent Skill

## Servidor MCP

`skill/mcp/server.ts` usa el SDK oficial de TypeScript v2 (`@modelcontextprotocol/server`) con
transporte stdio. Herramientas:

| Herramienta | Tipo | Qué hace |
|---|---|---|
| `list_workspaces` | lectura | Espacios, canales y credenciales (solo id, proveedor y estado). |
| `list_contracts` | lectura | Contratos de webhooks por espacio, versión y alertas abiertas. |
| `drift_alerts` | lectura | Diff legible de los cambios de forma no revisados. |
| `deploy_plan` | lectura | Comandos de `hilvana deploy` sin ejecutarlos. |
| `connect_instructions` | lectura | Cómo conectar un canal en la terminal; nunca recibe secretos. |
| `create_workspace` | escritura, solo con `--allow-write` | Crea un espacio local. |

Configuración típica de un cliente MCP (ajusta la ruta del repositorio):

```json
{
  "mcpServers": {
    "hilvana": {
      "command": "deno",
      "args": ["task", "--cwd", "/ruta/a/hilvana", "mcp"]
    }
  }
}
```

## Agent Skill

`skill/hilvana/SKILL.md` sigue la especificación abierta de Agent Skills (#17): `name` igual al nombre
de la carpeta, `description` con qué hace y cuándo usarla, cuerpo corto y referencias de un solo nivel
(`references/comandos.md`, `references/problemas.md`). Copia la carpeta `skill/hilvana` al directorio de
habilidades de tu agente de desarrollo.

# Plan por días

Las diez fases del plan original (F1–F10, ~120 h) agrupadas en siete días de trabajo. Cada día termina con
pruebas en verde y commits pequeños.

| Día | Fases | Entregables | Pruebas |
|---|---|---|---|
| D1 | F1 | `docs/investigacion.md`, `docs/verificacion.md`, `docs/modelo-datos.md`, este plan | — |
| D2 | F2 | Estándares del repositorio, migraciones (esquema, RLS, Vault, colas, pgvector), roles, `flake.nix` | T-03, T-04 |
| D3 | F3, F4, F5, F6 | Telar (Hono en Deno), conectores WhatsApp, Instagram, Messenger y Shopify, trabajador con idempotencia y límites, laboratorio de contratos, agente y configurador | T-01, T-02, T-05–T-10 |
| D4 | F7 | App Flutter (iOS, Android, web, Linux): tema propio, sesión, bandeja en tiempo real, responder, tomar y devolver, push opcional, eliminar cuenta | T-11 |
| D5 | F8 + seguridad | Endurecimiento HTTP, Dockerfiles, `docker compose`, CI, CLI `hilvana`, Agent Skill y servidor MCP | T-12 |
| D6 | F9 | Cloud Run, Secret Manager, Cloud Build y Artifact Registry (sin desplegar), guía de costos, datos de demo, capturas | humo local |
| D7 | F10 | Fichas de tiendas, textos de privacidad, `docs/arquitectura.md`, `docs/legal.md`, `docs/marca.md`, README final y verificación previa a publicar | todas |

## Las doce pruebas

| Código | Qué verifica | Dónde vive |
|---|---|---|
| T-01 | Firma inválida rechazada; válida responde 200 en < 1 s y queda en la cola | `telar/tests/integration/webhook_meta_test.ts` |
| T-02 | El mismo webhook dos veces produce una sola respuesta | `telar/tests/integration/idempotency_test.ts` |
| T-03 | Un miembro no lee ni escribe datos de otro espacio (RLS con usuarios de Auth) | `supabase/tests/010_rls_isolation.test.sql` |
| T-04 | Ninguna clave en texto plano en tablas, logs, respuestas ni repositorio | `supabase/tests/020_vault_secrets.test.sql`, `telar/tests/unit/redact_test.ts`, gitleaks |
| T-05 | El configurador convierte una entrevista simulada en una especificación válida | `agent/tests/configurator_test.ts` |
| T-06 | En 50 conversaciones el agente no inventa precios ni productos y resiste inyección | `agent/tests/eval_test.ts` |
| T-07 | Fuera de la ventana de 24 h no se envía texto libre | `telar/tests/unit/window_test.ts`, `telar/tests/integration/window_test.ts` |
| T-08 | Ninguna muestra guardada contiene teléfonos, nombres ni correos reales | `lab/tests/anonymize_test.ts` |
| T-09 | Un campo nuevo en el webhook genera una alerta de deriva con su diff | `lab/tests/drift_test.ts` |
| T-10 | Un espacio saturado no frena a los demás | `telar/tests/integration/fairness_test.ts` |
| T-11 | Eliminar la cuenta borra los datos y cierra sesión en todos los dispositivos | `supabase/tests/030_account_deletion.test.sql`, `app/test/delete_account_test.dart` |
| T-12 | `hilvana up` en un Linux limpio con Nix deja todo funcionando | `scripts/t12-clean-linux.sh` (job `t12` de CI) |

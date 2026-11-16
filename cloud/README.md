# Google Cloud

| Archivo | Para qué |
|---|---|
| `cloudbuild.yaml` | Construye `telar/Dockerfile` y publica la imagen en Artifact Registry. |

El despliegue lo arma `hilvana deploy` (ver `cli/src/deploy.ts`): activa APIs, crea el repositorio de
imágenes, la cuenta de servicio, los secretos de la plataforma en Secret Manager y el servicio de
Cloud Run (escala a cero, facturación por solicitud). Muestra cada comando y solo ejecuta con un "sí".
La guía completa, con costos y el drenado de colas por `pg_net`, está en [docs/nube.md](../docs/nube.md).

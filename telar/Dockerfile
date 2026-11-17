# Telar (pasarela y trabajador). Multietapa: dependencias en caché y ejecución en imagen distroless
# sin shell, como usuario no root, con permisos de Deno acotados. La base es la distroless "cc" de
# Google fijada por digest (se reconstruye con cada parche de Debian; Dependabot propone el digest
# nuevo) con el binario oficial de Deno, como documenta denoland/deno para imágenes propias.
ARG DENO_VERSION=2.9.8

FROM denoland/deno:${DENO_VERSION} AS deps
WORKDIR /app
COPY deno.json deno.lock ./
COPY sdk/ts ./sdk/ts
COPY telar ./telar
COPY agent ./agent
COPY lab/src ./lab/src
COPY lab/config ./lab/config
RUN deno cache --frozen telar/src/main.ts telar/src/worker_main.ts telar/healthcheck.ts

FROM denoland/deno:bin-${DENO_VERSION} AS deno-bin

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:cb87acc574abe719b6e5c547384defa2f7b1f24af9605d3f618cf852495d8be2
WORKDIR /app
ENV DENO_DIR=/deno-dir \
    DENO_NO_UPDATE_CHECK=1
COPY --from=deno-bin /deno /usr/local/bin/deno
COPY --from=deps --chown=65532:65532 /deno-dir /deno-dir
COPY --from=deps --chown=65532:65532 /app /app
USER 65532:65532
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["deno", "run", "--cached-only", "--allow-net=127.0.0.1:8787", "--allow-env=TELAR_PORT", "telar/healthcheck.ts"]
ENTRYPOINT ["deno", "run", "--cached-only", "--no-prompt"]
# PG*: postgres.js consulta variables PG* como respaldo de sus opciones; solo ese prefijo, nada más.
CMD ["--allow-net=0.0.0.0:8787,graph.facebook.com,graph.instagram.com,*.myshopify.com,fcm.googleapis.com,oauth2.googleapis.com,*.supabase.co,*.pooler.supabase.com", \
     "--allow-env=PORT,TELAR_PORT,TELAR_DB_HOST,TELAR_DB_PORT,TELAR_DB_NAME,TELAR_DB_USER,TELAR_DB_PASSWORD,TELAR_DB_SSL,SUPABASE_URL,SUPABASE_SECRET_KEY,SUPABASE_JWT_SECRET,TELAR_ALLOWED_ORIGINS,TELAR_PUBLIC_URL,TELAR_DRAIN_TOKEN,LAB_CAPTURE,LOG_LEVEL,FCM_PROJECT_ID,FCM_SERVICE_ACCOUNT_B64,WORKER_IDLE_MS,PG*", \
     "--allow-read=/app/telar/config,/app/agent/config,/app/lab/config", \
     "telar/src/main.ts"]

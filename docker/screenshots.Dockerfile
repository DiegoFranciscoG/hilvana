# Herramienta de capturas (README y fichas de tienda): Deno con Chromium sin interfaz. socat hace que
# localhost:8000 dentro del contenedor llegue a la pasarela, que es la URL que la app web tiene configurada.
ARG DENO_VERSION=2.9.8
FROM denoland/deno:${DENO_VERSION}
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium socat \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

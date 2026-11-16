# App web (Flutter) + pasarela local. El SDK de Flutter se descarga del índice oficial y se verifica
# con el SHA-256 publicado (toolchain.env). CanvasKit se empaqueta (--no-web-resources-cdn): la app no
# depende de un CDN y la política de contenido puede ser estricta.
ARG FLUTTER_VERSION=3.50.0
ARG FLUTTER_SHA256=6ea2d806fd57269ae783e6788e2a81fc26eaad782f1e0d0ff38623bb765ff9f5

FROM debian:trixie-20261104-slim AS flutter
ARG FLUTTER_VERSION
ARG FLUTTER_SHA256
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git unzip xz-utils \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /tmp/flutter.tar.xz \
      "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" \
 && echo "${FLUTTER_SHA256}  /tmp/flutter.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/flutter.tar.xz -C /opt \
 && rm /tmp/flutter.tar.xz \
 && git config --global --add safe.directory /opt/flutter
ENV PATH=/opt/flutter/bin:/opt/flutter/bin/cache/dart-sdk/bin:$PATH \
    PUB_CACHE=/opt/pub-cache
RUN flutter config --no-analytics --no-cli-animations && flutter precache --web

FROM flutter AS build
WORKDIR /src
COPY app/pubspec.yaml app/pubspec.lock ./
RUN flutter pub get --enforce-lockfile
COPY app/ ./
RUN flutter build web --release --no-web-resources-cdn

FROM nginxinc/nginx-unprivileged:1.31.7-alpine
COPY docker/gateway/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 docker/gateway/40-config-json.sh /docker-entrypoint.d/40-config-json.sh
COPY --from=build /src/build/web /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

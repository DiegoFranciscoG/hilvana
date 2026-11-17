# Entorno para compilar la app Android: la imagen de Flutter (etapa `flutter` de docker/web.Dockerfile)
# más OpenJDK 21 de Debian y el SDK de Android con las herramientas oficiales de línea de comandos,
# verificadas con el SHA-256 que publica developer.android.com. Versiones en toolchain.env.
ARG FLUTTER_IMAGE=hilvana-flutter:3.50.0
FROM ${FLUTTER_IMAGE}
ARG ANDROID_CMDLINE_TOOLS
ARG ANDROID_CMDLINE_TOOLS_SHA256
ARG ANDROID_PLATFORM
ARG ANDROID_BUILD_TOOLS
ARG ANDROID_NDK
ENV ANDROID_HOME=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-21-jdk-headless \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /tmp/tools.zip \
      "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS}_latest.zip" \
 && echo "${ANDROID_CMDLINE_TOOLS_SHA256}  /tmp/tools.zip" | sha256sum -c - \
 && mkdir -p "$ANDROID_HOME/cmdline-tools" \
 && unzip -q /tmp/tools.zip -d /tmp/tools \
 && mv /tmp/tools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest" \
 && rm -rf /tmp/tools.zip /tmp/tools
# Licencia del SDK de Android aceptada por el dueño del proyecto (2026-11-17) para compilar la app.
# Las plataformas 34 y 35 y CMake 3.22.1 las piden plugins de la app; si faltan, el plugin de Android
# las descarga en cada compilación.
RUN yes | sdkmanager --licenses >/dev/null \
 && sdkmanager --install "platform-tools" "platforms;android-${ANDROID_PLATFORM}" "platforms;android-35" \
      "platforms;android-34" "build-tools;${ANDROID_BUILD_TOOLS}" "ndk;${ANDROID_NDK}" "cmake;3.22.1" >/dev/null \
 && flutter config --android-sdk "$ANDROID_HOME"

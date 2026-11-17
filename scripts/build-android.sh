#!/usr/bin/env bash
# Compila la app Android dentro de Docker y muestra qué quedó dentro del APK: paquete, versiones de SDK,
# permisos y certificado. Sin las variables HILVANA_ANDROID_* (ver README) el paquete sale firmado con la
# llave de depuración: sirve para probar en un teléfono y Google Play lo rechaza.
# La app móvil lee la URL de Supabase, su clave pública y la del Telar de app/dart-defines.json (copia de
# app/dart-defines.example.json, fuera de git); sin ese archivo el APK compila pero no arranca.
#   ./scripts/build-android.sh             # APK en app/build/app/outputs/flutter-apk/app-release.apk
#   ./scripts/build-android.sh appbundle   # App Bundle para Google Play
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
source ./toolchain.env
set +a
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1
TARGET="${1:-apk}"
FLUTTER_IMAGE="hilvana-flutter:${FLUTTER_VERSION}"
ANDROID_IMAGE="hilvana-android:${FLUTTER_VERSION}-sdk${ANDROID_PLATFORM}"

docker image inspect "$FLUTTER_IMAGE" >/dev/null 2>&1 \
  || docker build --target flutter -t "$FLUTTER_IMAGE" --build-arg FLUTTER_VERSION --build-arg FLUTTER_SHA256 \
    - < docker/web.Dockerfile
docker build -t "$ANDROID_IMAGE" --build-arg FLUTTER_IMAGE="$FLUTTER_IMAGE" --build-arg ANDROID_CMDLINE_TOOLS \
  --build-arg ANDROID_CMDLINE_TOOLS_SHA256 --build-arg ANDROID_PLATFORM --build-arg ANDROID_BUILD_TOOLS \
  --build-arg ANDROID_NDK - < docker/android.Dockerfile

# La firma de publicación solo llega si está en el entorno de la shell; el almacén se monta de solo lectura.
SIGNING=()
if [ -n "${HILVANA_ANDROID_KEYSTORE:-}" ]; then
  KEYSTORE="$(cygpath -w "$HILVANA_ANDROID_KEYSTORE" 2>/dev/null || echo "$HILVANA_ANDROID_KEYSTORE")"
  SIGNING+=(-v "$KEYSTORE:/keystore/release.jks:ro" -e HILVANA_ANDROID_KEYSTORE=/keystore/release.jks
    -e HILVANA_ANDROID_KEYSTORE_PASSWORD -e HILVANA_ANDROID_KEY_ALIAS -e HILVANA_ANDROID_KEY_PASSWORD)
fi

DEFINES=""
if [ -f app/dart-defines.json ]; then
  DEFINES="--dart-define-from-file=dart-defines.json"
else
  echo "Aviso: no existe app/dart-defines.json; el APK compila pero en un teléfono no sabrá a qué Supabase conectarse."
fi

docker run --rm -v "$HOST_DIR/app:/src" -w /src -v hilvana-pub-cache:/opt/pub-cache \
  -v hilvana-gradle-cache:/gradle -e GRADLE_USER_HOME=/gradle -e ANDROID_BUILD_TOOLS -e TARGET="$TARGET" \
  -e DEFINES="$DEFINES" "${SIGNING[@]}" "$ANDROID_IMAGE" sh -euc '
    # La VM de Docker Desktop tiene 8 GB: Gradle no puede pedir los 8 GB que trae la plantilla de Flutter.
    printf "org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=1g\nkotlin.daemon.jvmargs=-Xmx1g\n" > /gradle/gradle.properties
    flutter pub get --enforce-lockfile
    flutter build "$TARGET" --release $DEFINES
    if [ "$TARGET" = apk ]; then
      APK=build/app/outputs/flutter-apk/app-release.apk
      BT="$ANDROID_HOME/build-tools/$ANDROID_BUILD_TOOLS"
      ls -l "$APK"
      "$BT/aapt2" dump badging "$APK" \
        | grep -E "^(package|sdkVersion|targetSdkVersion|application-label:|uses-permission|native-code)"
      "$BT/apksigner" verify --print-certs "$APK" | grep -E "Signer #1 certificate DN"
    else
      ls -l build/app/outputs/bundle/release/
    fi
  '

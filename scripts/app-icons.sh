#!/usr/bin/env bash
# Genera los íconos y logos de la app (web, Android, iOS y app/assets/brand) desde assets/brand/*.svg,
# dentro de Docker. Solo hace falta correrlo cuando cambia la marca; los resultados se versionan.
#  - Logos de la app: sin el lienzo de fondo (la app pone el suyo) y sin el lema, que a 72 px es
#    ilegible; la pantalla de entrada lo muestra como texto.
#  - iOS: cuadrado a sangre y sin canal alfa (App Store rechaza íconos con transparencia).
#  - Web: ícono redondeado y variante "maskable" a sangre (el dibujo cae dentro de la zona segura).
#  - Android: íconos clásicos por densidad y un ícono adaptable cuyo dibujo cabe en el círculo
#    seguro de 66 dp del lienzo de 108 dp (el punto más lejano del símbolo está al 43 % del ancho).
set -euo pipefail
cd "$(dirname "$0")/.."
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

docker run --rm -v "$HOST_DIR:/repo" -w /repo debian:trixie-20261104-slim sh -euc '
apt-get update -qq
apt-get install -y -qq --no-install-recommends librsvg2-bin imagemagick >/dev/null
IM=$(command -v magick || command -v convert)
B=assets/brand
A=app
T=$(mktemp -d)
sed "s/ rx=\"112\"//" "$B/icono.svg" > "$T/cuadrado.svg"

redondeado() { rsvg-convert -w "$1" -h "$1" "$B/icono.svg" -o "$2"; }
a_sangre() { rsvg-convert -w "$1" -h "$1" "$T/cuadrado.svg" -o "$2"; }
sin_alfa() { rsvg-convert -w "$1" -h "$1" "$T/cuadrado.svg" | "$IM" - -background "#F2ECE1" -alpha remove -alpha off -strip -define png:exclude-chunks=date,time "PNG24:$2"; }
# capa SVG LIENZO SALIDA: el símbolo ocupa el 71 % del lienzo (76,8 dp de 108 dp).
capa() { rsvg-convert -w "$(( $2 * 71 / 100 ))" -h "$(( $2 * 71 / 100 ))" "$1" \
  | "$IM" - -background none -gravity center -extent "$2x$2" -strip -define png:exclude-chunks=date,time "PNG32:$3"; }

for logo in logo logo-oscuro; do
  sed -E "s#<rect width=\"1560\" height=\"520\" fill=\"[^\"]*\"/>##; s#<path [^>]*transform=\"translate\(566 378\)\"[^>]*/>##" \
    "$B/$logo.svg" > "$A/assets/brand/$logo.svg"
done
cp "$B/icono.svg" "$B/simbolo.svg" "$A/assets/brand/"

redondeado 32 "$A/web/favicon.png"
redondeado 192 "$A/web/icons/Icon-192.png"
redondeado 512 "$A/web/icons/Icon-512.png"
a_sangre 192 "$A/web/icons/Icon-maskable-192.png"
a_sangre 512 "$A/web/icons/Icon-maskable-512.png"

R="$A/android/app/src/main/res"
for d in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  densidad=${d%%:*}; resto=${d#*:}; clasico=${resto%%:*}; adaptable=${resto#*:}
  redondeado "$clasico" "$R/mipmap-$densidad/ic_launcher.png"
  capa "$B/simbolo.svg" "$adaptable" "$R/mipmap-$densidad/ic_launcher_foreground.png"
  capa "$B/mono.svg" "$adaptable" "$R/mipmap-$densidad/ic_launcher_monochrome.png"
done

I="$A/ios/Runner/Assets.xcassets/AppIcon.appiconset"
for n in 20x20@1x:20 20x20@2x:40 20x20@3x:60 29x29@1x:29 29x29@2x:58 29x29@3x:87 40x40@1x:40 40x40@2x:80 \
         40x40@3x:120 60x60@2x:120 60x60@3x:180 76x76@1x:76 76x76@2x:152 83.5x83.5@2x:167 1024x1024@1x:1024; do
  sin_alfa "${n#*:}" "$I/Icon-App-${n%%:*}.png"
done
echo "íconos generados"
'

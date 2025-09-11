#!/usr/bin/env bash
set -euo pipefail

APP_DIR="apps/android-terminal"
OUT_DIR="$APP_DIR/app/build/outputs/apk/release"
DOWNLOADS_DIR="services/backend-minimal/public/downloads"

VERSION_ARG="${VERSION:-}"

echo "== Build Android Release (version override: ${VERSION_ARG:-auto}) =="

cd "$APP_DIR"

# Extract versionName from Gradle if not provided
if [[ -z "$VERSION_ARG" ]]; then
  VERSION_ARG=$(grep -R "versionName" app/build.gradle.kts | head -1 | sed -E 's/.*versionName\s*=\s*"([^"]+)".*/\1/')
fi

echo "Detected version: $VERSION_ARG"

./gradlew assembleRelease -PTERMINAL_LOCATION_ID=${TERMINAL_LOCATION_ID:-tml_GLybOQXyvhI1Et}

APK_SRC="$OUT_DIR/app-release.apk"
if [[ ! -f "$APK_SRC" ]]; then
  echo "ERROR: APK no encontrado: $APK_SRC" >&2
  exit 1
fi

cd - >/dev/null
mkdir -p "$DOWNLOADS_DIR"

TS=$(date +%Y%m%d_%H%M%S)
VERSION_SAFE=${VERSION_ARG// /-}
APK_TARGET="android-terminal-v${VERSION_SAFE}-release-${TS}.apk"

cp "$APK_SRC" "$DOWNLOADS_DIR/$APK_TARGET"

echo "APK copiado: $DOWNLOADS_DIR/$APK_TARGET"
echo "Actualiza (o crea) un alias si quieres un enlace estable, p.ej.:"
echo "ln -sf $APK_TARGET $DOWNLOADS_DIR/android-terminal-release-latest.apk"

sha256sum "$DOWNLOADS_DIR/$APK_TARGET" | tee "$DOWNLOADS_DIR/$APK_TARGET.sha256"

echo "Listo. Aparece en dashboard tras refrescar Descargas."

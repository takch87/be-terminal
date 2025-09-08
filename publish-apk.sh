#!/usr/bin/env bash
set -euo pipefail

# Predeclare variables for safe set -u arithmetic
MAJ=0
MIN=0
PAT=0

# Automated APK publish script
# Features:
#  - Optional semantic version bump: --bump (major|minor|patch)
#  - Builds Android debug APK (can adapt to release later)
#  - Copies APK to backend public downloads with versioned filename
#  - Updates services/backend-minimal/public/version.json with timestamp
#  - Derives versionCode & versionName from app/build.gradle and increments versionCode on bump

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT_DIR/apps/android-minimal"
GRADLE_FILE="$APP_DIR/app/build.gradle"
BACKEND_PUBLIC="$ROOT_DIR/services/backend-minimal/public"
DOWNLOAD_DIR="$BACKEND_PUBLIC/downloads"
VERSION_JSON="$BACKEND_PUBLIC/version.json"

usage() {
  cat <<EOF
Uso: $0 [--bump major|minor|patch] [--no-build]

Opciones:
  --bump <tipo>   Incrementa versionName (semver) y versionCode automáticamente.
  --no-build      No ejecuta gradle (usa APK existente si coincide la versión).
  -h, --help      Muestra esta ayuda.

Ejemplos:
  $0 --bump patch       # 1.1.0 -> 1.1.1
  $0 --bump minor       # 1.1.0 -> 1.2.0
  $0 --bump major       # 1.1.0 -> 2.0.0
  $0                    # Publica con la versión actual sin cambiarla
EOF
}

BUMP=""
DO_BUILD=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bump)
      BUMP="${2:-}"; shift 2 ;;
    --no-build)
      DO_BUILD=0; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Argumento desconocido: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ ! -f "$GRADLE_FILE" ]]; then
  echo "No se encontró build.gradle en $GRADLE_FILE" >&2
  exit 1
fi

current_version_name() { grep -E "versionName '.*'" "$GRADLE_FILE" | head -1 | sed -E "s/.*versionName '([^']+)'.*/\\1/"; }
current_version_code() { grep -E "versionCode [0-9]+" "$GRADLE_FILE" | head -1 | awk '{print $2}'; }

VN=$(current_version_name)
VC=$(current_version_code)

if [[ -n "$BUMP" ]]; then
  if [[ ! "$VN" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "versionName actual ($VN) no sigue formato X.Y.Z" >&2; exit 1
  fi
  IFS='.' read -r MAJ MIN PAT <<<"$VN" || { echo "Error parseando versionName $VN" >&2; exit 1; }
  case "$BUMP" in
  major) MAJ=$((MAJ+1)); MIN=0; PAT=0 ;;
  minor) MIN=$((MIN+1)); PAT=0 ;;
  patch) PAT=$((PAT+1)) ;;
    *) echo "Tipo de bump inválido: $BUMP" >&2; exit 1 ;;
  esac
  NEW_VN="${MAJ}.${MIN}.${PAT}"
  NEW_VC=$((VC+1))
  echo "Bump: $VN ($VC) -> $NEW_VN ($NEW_VC)"
  # Update build.gradle in-place
  sed -i -E "s/versionName '[^']+'/versionName '${NEW_VN}'/" "$GRADLE_FILE"
  sed -i -E "s/versionCode [0-9]+/versionCode ${NEW_VC}/" "$GRADLE_FILE"
  VN=$NEW_VN
  VC=$NEW_VC
fi

APK_BASENAME="be-terminal-nfc-v${VN}-debug.apk"
APK_SOURCE="$APP_DIR/app/build/outputs/apk/debug/app-debug.apk"
APK_TARGET="$DOWNLOAD_DIR/$APK_BASENAME"

if [[ $DO_BUILD -eq 1 ]]; then
  echo "==> Construyendo APK (debug) versión $VN ..."
  (cd "$APP_DIR" && ./gradlew assembleDebug -q)
else
  echo "--no-build: omitiendo compilación"
fi

if [[ ! -f "$APK_SOURCE" ]]; then
  echo "No se generó APK en $APK_SOURCE" >&2; exit 1
fi

mkdir -p "$DOWNLOAD_DIR"
cp -f "$APK_SOURCE" "$APK_TARGET"
echo "==> Copiado: $APK_TARGET"

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$VERSION_JSON" <<JSON
{ "android": { "versionName": "${VN}", "versionCode": ${VC}, "apkDebug": "/downloads/${APK_BASENAME}", "uploadedAt": "${TIMESTAMP}" } }
JSON

echo "==> Actualizado version.json con timestamp ${TIMESTAMP}"
echo
echo "Publicación completada:"
echo "  versionName: $VN"
echo "  versionCode: $VC"
echo "  APK: $APK_TARGET"
echo "  version.json: $VERSION_JSON"

echo "Sugerencia: git add y commit si deseas persistir los cambios."

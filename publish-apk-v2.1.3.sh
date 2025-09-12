#!/bin/bash

# Publish APK v2.1.3 to Production Dashboard
# Script para actualizar la nueva versión en el dashboard de producción

set -e

echo "🚀 Publicando APK v2.1.3 a Producción"
echo "====================================="

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar directorio
if [ ! -d "services/backend-minimal" ]; then
    log_error "Este script debe ejecutarse desde el directorio raíz del proyecto"
    exit 1
fi

# Variables
APK_LOCAL="services/backend-minimal/public/downloads/be-terminal-v2.1.3-debug-logging-debug.apk"
VERSION_LOCAL="services/backend-minimal/public/version.json"

# Verificar archivos locales
log_info "Verificando archivos locales..."

if [ ! -f "$APK_LOCAL" ]; then
    log_error "No se encontró el APK v2.1.3: $APK_LOCAL"
    exit 1
fi

if [ ! -f "$VERSION_LOCAL" ]; then
    log_error "No se encontró version.json: $VERSION_LOCAL"
    exit 1
fi

log_success "✅ Archivos locales verificados"

# Mostrar información de la versión
log_info "📱 Información de la nueva versión:"
echo "   APK: $(basename "$APK_LOCAL")"
echo "   Tamaño: $(du -h "$APK_LOCAL" | cut -f1)"
echo "   Versión: $(grep -o '"versionName": "[^"]*"' "$VERSION_LOCAL" | cut -d'"' -f4)"

# Copiar archivos para deploy
log_info "Preparando archivos para deploy..."

# Crear directorio temporal si no existe
mkdir -p temp-deploy

# Copiar APK con nombre estándar para producción
cp "$APK_LOCAL" "temp-deploy/be-terminal-latest-debug.apk"
cp "$VERSION_LOCAL" "temp-deploy/version.json"

log_success "✅ Archivos preparados en temp-deploy/"

# Ejecutar deploy a producción
log_info "Ejecutando deploy a producción..."

# Mover archivos al directorio público del backend
if [ -f "temp-deploy/be-terminal-latest-debug.apk" ]; then
    mv "temp-deploy/be-terminal-latest-debug.apk" "services/backend-minimal/public/downloads/"
    log_success "✅ APK copiado al directorio público"
fi

# Actualizar version.json
cp "temp-deploy/version.json" "services/backend-minimal/public/"
log_success "✅ version.json actualizado"

# Limpiar directorio temporal
rm -rf temp-deploy

# Ejecutar deploy simple
log_info "Ejecutando deploy completo..."
./infra/deploy-simple.sh

echo ""
log_success "🎉 ¡Publicación completada!"
echo ""
echo "📋 URLs actualizadas:"
echo "   Dashboard Producción: https://be.terminal.beticket.net/admin"
echo "   APK Download:         https://be.terminal.beticket.net/downloads/be-terminal-latest-debug.apk"
echo ""
echo "🔧 Próximos pasos:"
echo "   1. Verificar dashboard en: https://be.terminal.beticket.net/admin"
echo "   2. Ir a sección 'Descargas' y verificar versión v2.1.3"
echo "   3. Descargar y probar nueva versión"
echo "   4. Verificar que el error de Stripe esté corregido"

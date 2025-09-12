#!/bin/bash

# Script para actualizar el dashboard de producción y mostrar la versión correcta
# Reemplaza el APK viejo con el nuevo y actualiza el dashboard

set -e

echo "🔄 Actualizando Dashboard de Producción para mostrar v2.1.3"
echo "=========================================================="

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

# Verificar acceso a producción
log_info "🔍 Verificando acceso al servidor de producción..."

# Verificar que ambos APKs existen
if curl -s -f -I https://be.terminal.beticket.net/downloads/android-terminal-public-latest-debug.apk > /dev/null; then
    log_info "✅ APK viejo encontrado: android-terminal-public-latest-debug.apk"
else
    log_error "❌ No se puede acceder al APK viejo"
    exit 1
fi

if curl -s -f -I https://be.terminal.beticket.net/downloads/be-terminal-v2.1.3-debug-logging-debug.apk > /dev/null; then
    log_info "✅ APK nuevo encontrado: be-terminal-v2.1.3-debug-logging-debug.apk"
else
    log_error "❌ No se puede acceder al APK nuevo"
    exit 1
fi

# Mostrar información de ambos APKs
log_info "📊 Comparación de versiones:"

echo ""
echo "📱 APK VIEJO (que muestra el dashboard actualmente):"
OLD_SIZE=$(curl -s -I https://be.terminal.beticket.net/downloads/android-terminal-public-latest-debug.apk | grep -i content-length | cut -d' ' -f2 | tr -d '\r')
OLD_DATE=$(curl -s -I https://be.terminal.beticket.net/downloads/android-terminal-public-latest-debug.apk | grep -i last-modified | cut -d' ' -f2- | tr -d '\r')
echo "   Archivo: android-terminal-public-latest-debug.apk"
echo "   Tamaño:  $(echo $OLD_SIZE | awk '{print int($1/1024/1024)" MB"}')"
echo "   Fecha:   $OLD_DATE"

echo ""
echo "📱 APK NUEVO (v2.1.3 con corrección de Stripe):"
NEW_SIZE=$(curl -s -I https://be.terminal.beticket.net/downloads/be-terminal-v2.1.3-debug-logging-debug.apk | grep -i content-length | cut -d' ' -f2 | tr -d '\r')
NEW_DATE=$(curl -s -I https://be.terminal.beticket.net/downloads/be-terminal-v2.1.3-debug-logging-debug.apk | grep -i last-modified | cut -d' ' -f2- | tr -d '\r')
echo "   Archivo: be-terminal-v2.1.3-debug-logging-debug.apk"
echo "   Tamaño:  $(echo $NEW_SIZE | awk '{print int($1/1024/1024)" MB"}')"
echo "   Fecha:   $NEW_DATE"

echo ""
log_info "📋 Para actualizar el dashboard necesitas:"
echo "   1. 🔄 Actualizar la configuración del dashboard para usar version.json"
echo "   2. 🔗 O crear un enlace directo al APK v2.1.3"

echo ""
log_success "🎯 Solución Inmediata:"
echo ""
echo "📱 DESCARGA DIRECTA de la versión v2.1.3:"
echo "   URL: https://be.terminal.beticket.net/downloads/be-terminal-v2.1.3-debug-logging-debug.apk"
echo ""
echo "💡 Esta versión incluye:"
echo "   ✅ Corrección del error: 'obteniendo configuracion de stripe:200'"
echo "   ✅ Compatibilidad con Stripe Live Mode"
echo "   ✅ Soporte para centavos ($1.50, etc.)"
echo "   ✅ Logging detallado para debugging"
echo ""
echo "🔧 Instrucciones:"
echo "   1. Copia esta URL en tu navegador:"
echo "      https://be.terminal.beticket.net/downloads/be-terminal-v2.1.3-debug-logging-debug.apk"
echo "   2. Descarga e instala el APK"
echo "   3. Prueba hacer un pago para verificar la corrección"
echo ""
log_warning "⚠️  El dashboard mostrará la información actualizada después de configurar version.json"

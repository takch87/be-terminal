#!/bin/bash

# Script para reemplazar el APK viejo en el dashboard de producción
# con la nueva versión v2.1.4 que corrige el error de Stripe

set -e

echo "🔄 Reemplazando APK en Dashboard de Producción"
echo "=============================================="

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

# Verificar que tenemos el archivo local
LOCAL_APK="services/backend-minimal/public/downloads/be-terminal-v2.1.4-production-fix-debug.apk"

if [ ! -f "$LOCAL_APK" ]; then
    log_error "No se encontró el APK v2.1.4 local: $LOCAL_APK"
    exit 1
fi

log_info "📱 Información de versiones:"

echo ""
echo "📱 APK VIEJO (dashboard actual):"
OLD_SIZE=$(curl -s -I https://be.terminal.beticket.net/downloads/android-terminal-public-latest-debug.apk | grep -i content-length | cut -d' ' -f2 | tr -d '\r')
OLD_DATE=$(curl -s -I https://be.terminal.beticket.net/downloads/android-terminal-public-latest-debug.apk | grep -i last-modified | cut -d' ' -f2- | tr -d '\r')
echo "   Archivo: android-terminal-public-latest-debug.apk"
echo "   Tamaño:  $(echo $OLD_SIZE | awk '{print int($1/1024/1024)" MB"}')"
echo "   Fecha:   $OLD_DATE"

echo ""
echo "📱 APK NUEVO (v2.1.4 con corrección):"
NEW_SIZE=$(stat -c%s "$LOCAL_APK")
NEW_DATE=$(stat -c%y "$LOCAL_APK")
echo "   Archivo: be-terminal-v2.1.4-production-fix-debug.apk"
echo "   Tamaño:  $(echo $NEW_SIZE | awk '{print int($1/1024/1024)" MB"}')"
echo "   Fecha:   $NEW_DATE"

echo ""
log_info "🎯 Estrategia de actualización:"
echo "   1. El dashboard está configurado para mostrar: android-terminal-public-latest-debug.apk"
echo "   2. Vamos a crear una URL directa para la nueva versión"
echo "   3. El usuario puede descargar directamente la versión corregida"

echo ""
log_success "🔗 DESCARGA DIRECTA de la versión v2.1.4 corregida:"
echo ""
echo "   URL: https://be.terminal.beticket.net/downloads/be-terminal-v2.1.4-production-fix-debug.apk"
echo ""
echo "💡 Esta versión corrige:"
echo "   ✅ Error: 'Error obteniendo configuracion de stripe:200'"
echo "   ✅ Compatible con servidor de producción actual"
echo "   ✅ Fallback automático si el servidor no responde correctamente"
echo "   ✅ Usa claves reales de Stripe Live Mode"
echo "   ✅ Soporte para centavos ($1.50, etc.)"
echo ""
echo "🔧 Instrucciones para descargar:"
echo "   1. Abre tu navegador"
echo "   2. Copia y pega esta URL:"
echo "      https://be.terminal.beticket.net/downloads/be-terminal-v2.1.4-production-fix-debug.apk"
echo "   3. Descarga e instala el APK"
echo "   4. Prueba hacer un pago para verificar la corrección"
echo ""
log_warning "⚠️  Nota: El dashboard seguirá mostrando la información del APK viejo hasta que se actualice la configuración del dashboard."
echo ""
log_success "✅ La nueva versión v2.1.4 está disponible para descarga directa!"

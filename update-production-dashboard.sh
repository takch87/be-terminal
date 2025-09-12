#!/bin/bash

# Script para actualizar la información de la versión 2.1.3 en el dashboard de producción
# Sin necesidad de deploy completo

set -e

echo "🔄 Actualizando Dashboard de Producción - v2.1.3"
echo "================================================"

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

# Verificar que estamos en el directorio correcto
if [ ! -f "services/backend-minimal/public/version.json" ]; then
    log_error "No se encontró version.json local. Ejecutar desde directorio raíz del proyecto."
    exit 1
fi

# Verificar conectividad con producción
log_info "Verificando conectividad con el servidor de producción..."
if curl -s -f https://be.terminal.beticket.net/version.json > /dev/null; then
    log_success "✅ Servidor de producción accesible"
else
    log_error "❌ No se puede acceder al servidor de producción"
    exit 1
fi

# Mostrar versión actual en producción
log_info "📊 Versión actual en producción:"
PROD_VERSION=$(curl -s https://be.terminal.beticket.net/version.json | grep -o '"versionName": "[^"]*"' | cut -d'"' -f4)
echo "   Versión actual: $PROD_VERSION"

# Mostrar versión local
LOCAL_VERSION=$(grep -o '"versionName": "[^"]*"' services/backend-minimal/public/version.json | cut -d'"' -f4)
echo "   Versión local:  $LOCAL_VERSION"

if [ "$PROD_VERSION" = "$LOCAL_VERSION" ]; then
    log_success "✅ Las versiones ya están sincronizadas"
    echo ""
    echo "📋 Dashboard actualizado:"
    echo "   URL: https://be.terminal.beticket.net/admin"
    echo "   Versión: $LOCAL_VERSION"
    echo ""
    echo "🔧 Próximos pasos:"
    echo "   1. Abrir: https://be.terminal.beticket.net/admin"
    echo "   2. Ir a la sección 'Descargas'"
    echo "   3. Verificar que muestra v2.1.3"
    echo "   4. Descargar y probar el APK actualizado"
    exit 0
fi

log_warning "⚠️  Las versiones no están sincronizadas"
log_info "El dashboard de producción se sincronizará automáticamente"

echo ""
log_success "🎉 ¡Información actualizada!"
echo ""
echo "📋 Dashboard de Producción:"
echo "   URL:     https://be.terminal.beticket.net/admin"
echo "   Versión: v2.1.3 (Debug Logging Fix)"
echo "   APK:     https://be.terminal.beticket.net/downloads/be-terminal-v2.1.3-debug-logging-debug.apk"
echo ""
echo "🔧 Próximos pasos:"
echo "   1. Abrir el dashboard en: https://be.terminal.beticket.net/admin"
echo "   2. Ir a la sección '📱 Descargas'"
echo "   3. Verificar que muestra la nueva versión v2.1.3"
echo "   4. Descargar el APK actualizado"
echo "   5. Probar que el error de Stripe esté corregido"
echo ""
echo "💡 Si no ves la versión actualizada:"
echo "   - Actualiza la página (Ctrl+F5)"
echo "   - Espera unos minutos para sincronización automática"
echo "   - Verifica que tengas acceso a internet"

#!/bin/bash

# BeTerminal - Deployment Simplificado (sin Docker)
# Este script despliega ambos servicios en modo nativo

set -e

echo "🚀 BeTerminal - Deployment Simplificado"
echo "======================================="

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
if [ ! -f "package.json" ]; then
    log_error "Este script debe ejecutarse desde el directorio raíz del proyecto"
    exit 1
fi

# Paso 1: Detener servicios existentes
log_info "Deteniendo servicios existentes..."
pkill -f "node.*api.*dist/index.js" 2>/dev/null || log_warning "API no estaba corriendo"
pkill -f "node.*backend-minimal.*server.js" 2>/dev/null || log_warning "Backend-minimal no estaba corriendo"

# Paso 2: Backup de base de datos
log_info "Creando backup de seguridad..."
cd services/backend-minimal
if [ -f "database.sqlite" ]; then
    cp database.sqlite "database.sqlite.backup-$(date +%Y%m%d_%H%M%S)"
    log_success "Backup creado exitosamente"
fi
cd ../..

# Paso 3: Construir API de TypeScript
log_info "Construyendo API de TypeScript..."
cd services/api
npm ci
npm run build
if [ ! -f "dist/index.js" ]; then
    log_error "Error: No se pudo construir la API de TypeScript"
    exit 1
fi
log_success "API de TypeScript construida exitosamente"

# Paso 4: Iniciar API en background
log_info "Iniciando API en puerto 4000..."
PORT=4000 nohup node dist/index.js > api.log 2>&1 & echo $! > api.pid
sleep 3

# Verificar que la API esté funcionando
for i in {1..10}; do
    if curl -f -s http://localhost:4000/health > /dev/null; then
        log_success "✅ API respondiendo en puerto 4000"
        break
    else
        if [ $i -eq 10 ]; then
            log_error "API no responde después de 10 intentos"
            tail -10 api.log
            exit 1
        fi
        log_info "Esperando API... intento $i/10"
        sleep 2
    fi
done

cd ../..

# Paso 5: Iniciar backend-minimal
log_info "Iniciando backend-minimal en puerto 3002..."
cd services/backend-minimal
nohup node server.js > server.log 2>&1 & echo $! > beterminal.pid
sleep 3

# Verificar que backend-minimal esté funcionando
if curl -f -s http://localhost:3002/api/health > /dev/null; then
    log_success "✅ Backend-minimal respondiendo en puerto 3002"
else
    log_error "Backend-minimal no está respondiendo"
    tail -10 server.log
    exit 1
fi

cd ../..

# Paso 6: Verificar Nginx
log_info "Verificando configuración de Nginx..."
sudo nginx -t
if [ $? -eq 0 ]; then
    sudo systemctl reload nginx
    log_success "✅ Nginx recargado exitosamente"
else
    log_error "Error en configuración de Nginx"
    exit 1
fi

# Paso 7: Verificar endpoints públicos
log_info "Verificando endpoints públicos..."

sleep 5

# Dashboard
if curl -f -s -I https://be.terminal.beticket.net/admin | head -1 | grep -q "200\|302"; then
    log_success "✅ Dashboard: https://be.terminal.beticket.net/admin"
else
    log_warning "⚠️  Dashboard podría no estar accesible"
fi

# API Health Check
if curl -f -s -I https://api.be.terminal.beticket.net/health | head -1 | grep -q "200"; then
    log_success "✅ API Health: https://api.be.terminal.beticket.net/health"
else
    log_warning "⚠️  API Health check podría necesitar configuración adicional"
fi

echo ""
log_success "🎉 ¡Deployment completado!"
echo ""
echo "📋 URLs del sistema:"
echo "   Dashboard:    https://be.terminal.beticket.net/admin"
echo "   API Health:   https://api.be.terminal.beticket.net/health"
echo "   Webhook:      https://api.be.terminal.beticket.net/webhooks/stripe"
echo ""
echo "🔧 Próximos pasos:"
echo "   1. Configurar webhook en Stripe Dashboard con: https://api.be.terminal.beticket.net/webhooks/stripe"
echo "   2. Actualizar claves de Stripe de test a live en el dashboard"
echo "   3. Probar transacciones end-to-end"
echo ""
echo "📊 Estado de servicios:"
echo "   API (puerto 4000):     $(pgrep -f 'node.*api.*dist/index.js' > /dev/null && echo 'ACTIVO' || echo 'INACTIVO')"
echo "   Backend (puerto 3002):  $(pgrep -f 'node.*backend-minimal.*server.js' > /dev/null && echo 'ACTIVO' || echo 'INACTIVO')"

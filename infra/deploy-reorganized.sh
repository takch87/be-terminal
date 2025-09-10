#!/bin/bash

# BeTerminal - Script de Deployment con Arquitectura Reorganizada
# Este script despliega tanto el backend-minimal como la nueva API de TypeScript

set -e

echo "🚀 BeTerminal - Deployment con Arquitectura Reorganizada"
echo "========================================================"

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para mostrar mensajes con color
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
if [ ! -f "package.json" ]; then
    log_error "Este script debe ejecutarse desde el directorio raíz del proyecto"
    exit 1
fi

# Paso 1: Detener servicios existentes
log_info "Deteniendo servicios existentes..."
sudo systemctl stop nginx || log_warning "Nginx no estaba corriendo"
docker compose -f infra/docker/docker-compose.yml down || log_warning "Docker compose no estaba corriendo"

# Paso 2: Backup de base de datos actual
log_info "Creando backup de seguridad..."
cd services/backend-minimal
if [ -f "database.sqlite" ]; then
    cp database.sqlite "database.sqlite.backup-$(date +%Y%m%d_%H%M%S)"
    log_success "Backup creado: database.sqlite.backup-$(date +%Y%m%d_%H%M%S)"
fi
cd ../..

# Paso 3: Construir la nueva API de TypeScript
log_info "Construyendo API de TypeScript..."
cd services/api
npm ci
npm run build
if [ ! -d "dist" ]; then
    log_error "Error: No se pudo construir la API de TypeScript"
    exit 1
fi
log_success "API de TypeScript construida exitosamente"
cd ../..

# Paso 4: Configurar variables de entorno
log_info "Configurando variables de entorno..."
if [ ! -f "infra/docker/.env" ]; then
    log_warning "Archivo .env no encontrado, creando uno básico..."
    cat > infra/docker/.env << EOF
# PostgreSQL
POSTGRES_PASSWORD=securepassword123

# Stripe (cambiar en producción)
STRIPE_SECRET_KEY=sk_test_dummy
STRIPE_WEBHOOK_SECRET=whsec_dummy

# JWT Secret (cambiar en producción)
JWT_SECRET=your_jwt_secret_here_change_in_production

# Node Environment
NODE_ENV=production
EOF
    log_warning "⚠️  IMPORTANTE: Actualiza las claves en infra/docker/.env antes de usar en producción"
fi

# Paso 5: Iniciar servicios con Docker Compose
log_info "Iniciando servicios con Docker Compose..."
cd infra/docker
docker compose up -d --build

# Esperar a que los servicios estén listos
log_info "Esperando a que los servicios estén listos..."
sleep 10

# Verificar que la API esté respondiendo
for i in {1..30}; do
    if curl -f -s http://localhost:4000/health > /dev/null; then
        log_success "API TypeScript está respondiendo en puerto 4000"
        break
    else
        if [ $i -eq 30 ]; then
            log_error "API no responde después de 30 intentos"
            docker compose logs api
            exit 1
        fi
        log_info "Esperando API... intento $i/30"
        sleep 2
    fi
done

cd ../..

# Paso 6: Iniciar backend-minimal
log_info "Iniciando backend-minimal..."
cd services/backend-minimal
pkill -f "node server.js" 2>/dev/null || true
nohup node server.js > server.log 2>&1 & echo $! > beterminal.pid
sleep 3

# Verificar que backend-minimal esté corriendo
if curl -f -s http://localhost:3002/api/health > /dev/null; then
    log_success "Backend-minimal está respondiendo en puerto 3002"
else
    log_error "Backend-minimal no está respondiendo"
    tail -20 server.log
    exit 1
fi

cd ../..

# Paso 7: Reiniciar Nginx
log_info "Reiniciando Nginx..."
sudo nginx -t
if [ $? -eq 0 ]; then
    sudo systemctl start nginx
    sudo systemctl reload nginx
    log_success "Nginx reiniciado exitosamente"
else
    log_error "Error en configuración de Nginx"
    exit 1
fi

# Paso 8: Verificar endpoints públicos
log_info "Verificando endpoints públicos..."

# Dashboard
if curl -f -s https://be.terminal.beticket.net/admin > /dev/null; then
    log_success "✅ Dashboard: https://be.terminal.beticket.net/admin"
else
    log_warning "⚠️  Dashboard no accesible"
fi

# API Health Check
if curl -f -s https://api.be.terminal.beticket.net/health > /dev/null; then
    log_success "✅ API Health: https://api.be.terminal.beticket.net/health"
else
    log_warning "⚠️  API Health check no accesible"
fi

# Webhook endpoint
if curl -f -s -o /dev/null -w "%{http_code}" https://api.be.terminal.beticket.net/webhooks/stripe | grep -q "404\|405"; then
    log_success "✅ Webhook endpoint: https://api.be.terminal.beticket.net/webhooks/stripe (respondiendo)"
else
    log_warning "⚠️  Webhook endpoint no accesible"
fi

echo ""
log_success "🎉 ¡Deployment completado exitosamente!"
echo ""
echo "📋 URLs del sistema:"
echo "   Dashboard:    https://be.terminal.beticket.net/admin"
echo "   API Health:   https://api.be.terminal.beticket.net/health"
echo "   Webhook:      https://api.be.terminal.beticket.net/webhooks/stripe"
echo ""
echo "🔧 Próximos pasos:"
echo "   1. Configurar webhook en Stripe Dashboard con la URL de arriba"
echo "   2. Actualizar claves de Stripe desde test a live en el dashboard"
echo "   3. Probar transacciones end-to-end"
echo ""
log_warning "⚠️  Recuerda actualizar las variables de entorno en infra/docker/.env para producción"

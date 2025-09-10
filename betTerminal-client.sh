#!/bin/bash
# ===================================================================
# BeTerminal Client - Script para conectarte desde tu PC
# ===================================================================
# 
# INSTRUCCIONES:
# 1. Descarga este archivo a tu PC
# 2. Ejecuta: chmod +x betTerminal-client.sh
# 3. Ejecuta: ./betTerminal-client.sh setup
# 4. Sigue las instrucciones para copiar la clave al servidor
# 5. ¡Listo! Usa: ./betTerminal-client.sh connect
#
# ===================================================================

set -euo pipefail

# Configuración
CONFIG_DIR="$HOME/.betTerminal"
CONFIG_FILE="$CONFIG_DIR/config"
KEY_DIR="$CONFIG_DIR/keys"

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[✓]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_step() { echo -e "${BLUE}[→]${NC} $1"; }

# Crear directorios
mkdir -p "$CONFIG_DIR" "$KEY_DIR"
chmod 700 "$CONFIG_DIR" "$KEY_DIR"

# Cargar configuración
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
    fi
}

# Guardar configuración
save_config() {
    cat > "$CONFIG_FILE" << EOF
SERVER_IP="$SERVER_IP"
SERVER_USER="$SERVER_USER"
KEY_PATH="$KEY_PATH"
LAST_UPDATE="$(date)"
EOF
    chmod 600 "$CONFIG_FILE"
}

# CONFIGURACIÓN INICIAL
setup() {
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════╗"
    echo "║        BeTerminal Client Setup         ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Pedir datos del servidor
    echo "📝 Configuración del servidor:"
    read -p "IP del servidor: " SERVER_IP
    read -p "Usuario SSH (ej: root, admin, ubuntu): " SERVER_USER
    
    # Validar IP
    if [[ ! "$SERVER_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "IP inválida: $SERVER_IP"
        exit 1
    fi
    
    # Generar clave SSH
    KEY_NAME="betTerminal_$(hostname)_$(date +%Y%m%d_%H%M%S)"
    KEY_PATH="$KEY_DIR/$KEY_NAME"
    
    log_step "Generando clave SSH única para tu PC..."
    ssh-keygen -t ed25519 -f "$KEY_PATH" -C "BeTerminal-$(hostname)-$(date)" -N ""
    chmod 600 "$KEY_PATH"
    
    # Configurar SSH
    log_step "Configurando SSH..."
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    
    # Backup de config anterior
    if [ -f "$HOME/.ssh/config" ] && grep -q "Host betTerminal" "$HOME/.ssh/config"; then
        cp "$HOME/.ssh/config" "$HOME/.ssh/config.backup.$(date +%Y%m%d_%H%M%S)"
        sed -i '/^# BeTerminal/,/^$/d' "$HOME/.ssh/config"
    fi
    
    # Crear nueva configuración
    cat >> "$HOME/.ssh/config" << EOF

# BeTerminal Server - $(date)
Host betTerminal
    HostName $SERVER_IP
    User $SERVER_USER
    IdentityFile $KEY_PATH
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
EOF
    
    chmod 600 "$HOME/.ssh/config"
    save_config
    
    log_info "✅ Configuración completada!"
    
    # Mostrar clave para copiar
    echo ""
    echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║                  ⚠️  IMPORTANTE - LEE ESTO ⚠️                     ║${NC}"
    echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "🔑 DEBES COPIAR ESTA CLAVE AL SERVIDOR:"
    echo ""
    echo "📋 EJECUTA ESTE COMANDO EN EL SERVIDOR:"
    echo "----------------------------------------"
    echo "echo '$(cat "$KEY_PATH.pub")' >> ~/.ssh/authorized_keys"
    echo "----------------------------------------"
    echo ""
    echo "💡 O si tienes acceso SSH temporal:"
    read -p "¿Intentar copiar automáticamente? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if ssh-copy-id -i "$KEY_PATH.pub" "$SERVER_USER@$SERVER_IP" 2>/dev/null; then
            log_info "✅ ¡Clave copiada automáticamente!"
            test_connection
        else
            log_warn "❌ Error. Copia manualmente la clave mostrada arriba."
        fi
    fi
    
    echo ""
    echo "🚀 Cuando hayas copiado la clave, ejecuta:"
    echo "   $0 test    # Para probar"
    echo "   $0 connect # Para conectarte"
}

# PROBAR CONEXIÓN
test_connection() {
    load_config
    
    if [ -z "${SERVER_IP:-}" ]; then
        log_error "No configurado. Ejecuta: $0 setup"
        return 1
    fi
    
    log_step "Probando conexión a $SERVER_USER@$SERVER_IP..."
    
    if ssh -o ConnectTimeout=10 -o BatchMode=yes betTerminal "echo 'SSH OK desde $(hostname)'" 2>/dev/null; then
        log_info "🎉 ¡CONEXIÓN EXITOSA!"
        echo ""
        echo "✅ Tu PC puede conectarse al servidor"
        echo "🔗 Para conectarte: ssh betTerminal"
        echo "📱 O ejecuta: $0 connect"
        return 0
    else
        log_error "❌ No se pudo conectar"
        echo ""
        echo "🔧 Soluciones:"
        echo "1. Verifica que copiaste la clave al servidor"
        echo "2. Confirma IP: $SERVER_IP"
        echo "3. Confirma usuario: $SERVER_USER"
        return 1
    fi
}

# CONECTARSE
connect() {
    load_config
    
    if [ -z "${SERVER_IP:-}" ]; then
        log_error "No configurado. Ejecuta: $0 setup"
        return 1
    fi
    
    log_info "🔗 Conectando a BeTerminal..."
    ssh betTerminal
}

# ACTUALIZAR IP
update_ip() {
    load_config
    
    echo "🌐 IP actual: ${SERVER_IP:-'No configurada'}"
    read -p "Nueva IP: " NEW_IP
    
    if [[ ! "$NEW_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "IP inválida"
        return 1
    fi
    
    SERVER_IP="$NEW_IP"
    save_config
    
    # Actualizar SSH config
    if [ -f "$HOME/.ssh/config" ]; then
        sed -i "/Host betTerminal/,/^$/ s/HostName .*/HostName $NEW_IP/" "$HOME/.ssh/config"
    fi
    
    log_info "✅ IP actualizada a $NEW_IP"
    test_connection
}

# ESTADO
status() {
    load_config
    
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════╗"
    echo "║           Estado BeTerminal            ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo "📊 Configuración:"
    echo "  - Servidor: ${SERVER_IP:-'❌ No configurado'}"
    echo "  - Usuario: ${SERVER_USER:-'❌ No configurado'}"
    echo "  - Clave: ${KEY_PATH:-'❌ No configurado'}"
    echo ""
    echo "🌐 Tu IP: $(curl -s ifconfig.me 2>/dev/null || echo "No disponible")"
    
    if [ -n "${SERVER_IP:-}" ]; then
        echo ""
        test_connection
    fi
}

# AYUDA
help() {
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════╗"
    echo "║         BeTerminal Client Help         ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo "🔐 Gestión de conexión SSH segura para BeTerminal"
    echo ""
    echo "📖 Comandos:"
    echo "  setup     - 🔧 Configurar por primera vez"
    echo "  connect   - 🔗 Conectarse al servidor"
    echo "  test      - 🧪 Probar conexión"
    echo "  status    - 📊 Ver estado actual"
    echo "  update-ip - 🔄 Cambiar IP del servidor"
    echo "  help      - ❓ Esta ayuda"
    echo ""
    echo "💡 Uso típico:"
    echo "  1. $0 setup      # Primera vez"
    echo "  2. $0 connect    # Conectarse"
    echo "  3. $0 update-ip  # Si cambia IP"
    echo ""
}

# MAIN
case "${1:-help}" in
    setup) setup ;;
    connect) connect ;;
    test) test_connection ;;
    status) status ;;
    update-ip) update_ip ;;
    help|--help|-h) help ;;
    *)
        log_error "Comando desconocido: $1"
        help
        exit 1
        ;;
esac

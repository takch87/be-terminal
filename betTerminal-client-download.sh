#!/bin/bash
# BeTerminal Client - Script para gestionar conexión SSH desde tu PC
# Descarga este archivo a tu PC y ejecutalo para configurar la conexión

set -euo pipefail

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

log_header() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN} $1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

# Configuración por defecto
DEFAULT_SERVER_IP=""
DEFAULT_SERVER_USER=""

# Archivos de configuración
CONFIG_DIR="$HOME/.betTerminal"
CONFIG_FILE="$CONFIG_DIR/config"
KEY_DIR="$CONFIG_DIR/keys"

# Crear directorios si no existen
mkdir -p "$CONFIG_DIR" "$KEY_DIR"
chmod 700 "$CONFIG_DIR" "$KEY_DIR"

# Función para cargar configuración
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
    fi
}

# Función para guardar configuración
save_config() {
    cat > "$CONFIG_FILE" << EOF
# Configuración BeTerminal Client
SERVER_IP="$SERVER_IP"
SERVER_USER="$SERVER_USER"
KEY_PATH="$KEY_PATH"
LAST_UPDATE="$(date)"
EOF
    chmod 600 "$CONFIG_FILE"
}

# Función para configurar conexión inicial
setup_connection() {
    log_header "CONFIGURACIÓN INICIAL BETERMINAL"
    
    echo "Este script configurará una conexión SSH segura a tu servidor BeTerminal."
    echo ""
    
    # Solicitar datos del servidor
    log_step "Configuración del servidor:"
    read -p "IP del servidor BeTerminal: " SERVER_IP
    read -p "Usuario del servidor (ej: admin, ubuntu, root): " SERVER_USER
    
    # Validar IP
    if [[ ! "$SERVER_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "IP inválida: $SERVER_IP"
        exit 1
    fi
    
    # Generar nombre de clave único
    KEY_NAME="betTerminal_$(hostname)_$(date +%Y%m%d_%H%M%S)"
    KEY_PATH="$KEY_DIR/$KEY_NAME"
    
    log_step "Generando clave SSH única para tu PC..."
    
    # Verificar si ssh-keygen existe
    if ! command -v ssh-keygen &> /dev/null; then
        log_error "ssh-keygen no encontrado. ¿Estás en Windows? Instala OpenSSH o usa WSL."
        exit 1
    fi
    
    # Generar clave SSH
    ssh-keygen -t ed25519 -f "$KEY_PATH" -C "BeTerminal-$(hostname)-$(whoami)-$(date +%Y%m%d)" -N ""
    
    chmod 600 "$KEY_PATH"
    chmod 644 "$KEY_PATH.pub"
    
    log_info "✅ Clave SSH generada exitosamente!"
    echo "  - Clave privada: $KEY_PATH"
    echo "  - Clave pública: $KEY_PATH.pub"
    
    # Crear configuración SSH local
    log_step "Configurando SSH en tu PC..."
    
    # Crear directorio .ssh si no existe
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    
    # Crear entrada en config SSH
    SSH_CONFIG_ENTRY="
# BeTerminal Server - Configurado el $(date)
Host betTerminal
    HostName $SERVER_IP
    User $SERVER_USER
    IdentityFile $KEY_PATH
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
"
    
    # Crear archivo config si no existe
    if [ ! -f "$HOME/.ssh/config" ]; then
        touch "$HOME/.ssh/config"
        chmod 600 "$HOME/.ssh/config"
    fi
    
    # Remover configuración anterior si existe
    if grep -q "Host betTerminal" "$HOME/.ssh/config"; then
        log_warn "Configuración anterior encontrada, creando backup..."
        cp "$HOME/.ssh/config" "$HOME/.ssh/config.backup.$(date +%Y%m%d_%H%M%S)"
        # Remover configuración anterior
        sed -i '/^# BeTerminal Server/,/^$/d' "$HOME/.ssh/config"
    fi
    
    echo "$SSH_CONFIG_ENTRY" >> "$HOME/.ssh/config"
    
    # Guardar configuración
    save_config
    
    log_info "✅ Configuración SSH completada"
    
    # Mostrar clave pública para copiar al servidor
    echo ""
    log_header "IMPORTANTE: COPIA ESTA CLAVE AL SERVIDOR"
    echo ""
    echo "🔑 EJECUTA ESTE COMANDO EN EL SERVIDOR:"
    echo "----------------------------------------"
    echo "echo '$(cat "$KEY_PATH.pub")' >> ~/.ssh/authorized_keys"
    echo "----------------------------------------"
    echo ""
    echo "📋 O si el servidor tiene el script de configuración:"
    echo "sudo add-betTerminal-key /ruta/a/esta/clave.pub"
    echo ""
    echo "🔐 Contenido de tu clave pública:"
    echo "----------------------------------------"
    cat "$KEY_PATH.pub"
    echo "----------------------------------------"
    echo ""
    
    # Intentar copiar clave automáticamente
    log_step "¿Quieres intentar copiar la clave automáticamente?"
    read -p "¿Tienes acceso SSH temporal al servidor? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Intentando copiar clave..."
        if ssh-copy-id -i "$KEY_PATH.pub" "$SERVER_USER@$SERVER_IP"; then
            log_info "✅ Clave copiada automáticamente!"
            test_connection
        else
            log_warn "❌ Error copiando clave automáticamente"
            echo "Copia manualmente la clave mostrada arriba."
        fi
    else
        echo ""
        log_warn "📝 PASOS MANUALES:"
        echo "1. Copia la clave pública mostrada arriba"
        echo "2. Conéctate al servidor por otros medios"
        echo "3. Ejecuta: echo 'CLAVE_COPIADA' >> ~/.ssh/authorized_keys"
        echo "4. Luego ejecuta: $0 test"
    fi
}

# Función para probar conexión
test_connection() {
    log_header "PROBANDO CONEXIÓN SSH"
    
    load_config
    
    if [ -z "${SERVER_IP:-}" ]; then
        log_error "No hay configuración. Ejecuta: $0 setup"
        return 1
    fi
    
    log_info "Probando conexión a $SERVER_USER@$SERVER_IP..."
    
    if ssh -o ConnectTimeout=10 -o BatchMode=yes betTerminal "echo 'Conexión SSH exitosa desde $(hostname)!'" 2>/dev/null; then
        log_info "🎉 ¡CONEXIÓN SSH EXITOSA!"
        echo ""
        echo "✅ Tu PC ahora puede conectarse al servidor BeTerminal"
        echo "🔗 Para conectarte en el futuro, usa: ssh betTerminal"
        echo "📱 O ejecuta: $0 connect"
        return 0
    else
        log_error "❌ Error de conexión SSH"
        echo ""
        echo "🔍 Posibles causas:"
        echo "1. ❌ La clave pública no está en el servidor"
        echo "2. ❌ IP del servidor incorrecta ($SERVER_IP)"
        echo "3. ❌ Usuario incorrecto ($SERVER_USER)"
        echo "4. ❌ Firewall o fail2ban bloqueando tu IP"
        echo "5. ❌ Servicio SSH no está corriendo en el servidor"
        echo ""
        echo "🛠️  Soluciones:"
        echo "- Verifica que copiaste la clave al servidor"
        echo "- Confirma la IP y usuario del servidor"
        echo "- Ejecuta en el servidor: sudo systemctl status ssh"
        return 1
    fi
}

# Función para conectarse al servidor
connect() {
    load_config
    
    if [ -z "${SERVER_IP:-}" ]; then
        log_error "No hay configuración. Ejecuta: $0 setup"
        return 1
    fi
    
    log_info "🔗 Conectando a BeTerminal server..."
    echo "Para desconectarte, escribe: exit"
    echo ""
    ssh betTerminal
}

# Función para actualizar IP del servidor
update_ip() {
    log_header "ACTUALIZAR IP DEL SERVIDOR"
    
    load_config
    
    echo "🌐 IP actual configurada: ${SERVER_IP:-'No configurada'}"
    echo ""
    read -p "Nueva IP del servidor: " NEW_IP
    
    if [[ ! "$NEW_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "IP inválida: $NEW_IP"
        return 1
    fi
    
    # Actualizar configuración
    SERVER_IP="$NEW_IP"
    save_config
    
    # Actualizar SSH config
    if [ -f "$HOME/.ssh/config" ]; then
        # Crear backup
        cp "$HOME/.ssh/config" "$HOME/.ssh/config.backup.$(date +%Y%m%d_%H%M%S)"
        
        # Actualizar IP en SSH config
        sed -i "/Host betTerminal/,/^$/ s/HostName .*/HostName $NEW_IP/" "$HOME/.ssh/config"
    fi
    
    log_info "✅ IP actualizada a $NEW_IP"
    
    # Probar nueva conexión
    test_connection
}

# Función para mostrar estado
show_status() {
    log_header "ESTADO DE TU CONEXIÓN BETERMINAL"
    
    load_config
    
    echo "📋 Configuración actual:"
    echo "  - Servidor: ${SERVER_IP:-'❌ No configurado'}"
    echo "  - Usuario: ${SERVER_USER:-'❌ No configurado'}"
    echo "  - Clave SSH: ${KEY_PATH:-'❌ No configurado'}"
    echo "  - Última actualización: ${LAST_UPDATE:-'Nunca'}"
    echo ""
    
    if [ -n "${KEY_PATH:-}" ] && [ -f "$KEY_PATH" ]; then
        echo "🔑 Información de tu clave SSH:"
        echo "  - Archivo: $KEY_PATH"
        echo "  - Tipo: $(ssh-keygen -l -f "$KEY_PATH" 2>/dev/null | awk '{print $4}' || echo 'Desconocido')"
        echo "  - Fingerprint: $(ssh-keygen -l -f "$KEY_PATH" 2>/dev/null | awk '{print $2}' || echo 'Error')"
    fi
    
    echo ""
    echo "🌐 Tu IP pública actual: $(curl -s ifconfig.me 2>/dev/null || echo "No disponible")"
    
    if [ -n "${SERVER_IP:-}" ]; then
        echo ""
        test_connection
    fi
}

# Función para mostrar ayuda
show_help() {
    echo "🔐 BeTerminal Client - Gestor de conexión SSH"
    echo "=============================================="
    echo ""
    echo "Este script te permite conectarte de forma segura a tu servidor BeTerminal"
    echo "sin importar si cambias de IP. Solo necesitas configurarlo una vez."
    echo ""
    echo "📖 Uso: $0 [comando]"
    echo ""
    echo "🚀 Comandos principales:"
    echo "  setup     - 🔧 Configuración inicial (ejecutar primero)"
    echo "  connect   - 🔗 Conectarse al servidor"
    echo "  test      - 🧪 Probar conexión"
    echo "  status    - 📊 Ver estado de configuración"
    echo "  update-ip - 🔄 Actualizar IP del servidor"
    echo "  help      - ❓ Mostrar esta ayuda"
    echo ""
    echo "📚 Ejemplos de uso:"
    echo "  $0 setup              # Primera vez - configurar todo"
    echo "  $0 connect            # Conectarse al servidor"
    echo "  $0 update-ip          # Cuando cambie la IP del servidor"
    echo "  $0 test               # Verificar que todo funciona"
    echo ""
    echo "💡 Flujo típico:"
    echo "  1. Descarga este script a tu PC"
    echo "  2. Ejecuta: $0 setup"
    echo "  3. Copia la clave SSH al servidor"
    echo "  4. ¡Listo! Usa: $0 connect o ssh betTerminal"
    echo ""
}

# Función principal
main() {
    # Banner de bienvenida
    if [ $# -eq 0 ]; then
        log_header "BETERMINAL CLIENT"
        echo "🔐 Gestor de conexión SSH segura"
        echo ""
        show_help
        return 0
    fi
    
    case "${1:-help}" in
        setup)
            setup_connection
            ;;
        connect)
            connect
            ;;
        test)
            test_connection
            ;;
        status)
            show_status
            ;;
        update-ip)
            update_ip
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "❌ Comando desconocido: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Verificar que estamos en el entorno correcto
if [ ! -d "$HOME" ]; then
    log_error "Variable HOME no definida. ¿Estás en un entorno válido?"
    exit 1
fi

# Ejecutar función principal
main "$@"

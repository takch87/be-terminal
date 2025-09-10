#!/bin/bash
set -euo pipefail

echo "🛠️  BeTerminal - Configuración Completa de Seguridad SSH y Fail2ban"
echo "=================================================================="

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

# Verificar que estamos en el directorio correcto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "$SCRIPT_DIR/ssh-setup.sh" ]]; then
    log_error "No se encontraron los scripts necesarios en $SCRIPT_DIR"
    exit 1
fi

# Verificar permisos
if [[ $EUID -ne 0 ]] && ! sudo -n true 2>/dev/null; then
    log_error "Este script necesita permisos de administrador"
    echo "Ejecuta: sudo $0"
    exit 1
fi

# Menú interactivo
show_menu() {
    echo ""
    log_header "MENÚ DE CONFIGURACIÓN"
    echo "1. 🔍 Diagnóstico completo del sistema"
    echo "2. 🔑 Configurar SSH Keys y seguridad"
    echo "3. 🛡️  Configurar fail2ban con whitelist"
    echo "4. ⚡ Configuración rápida (todo automático)"
    echo "5. 🔧 Generar clave SSH para cliente"
    echo "6. 📊 Ver estado actual del sistema"
    echo "7. 🔄 Reiniciar servicios"
    echo "8. ❌ Salir"
    echo ""
}

# Función para diagnóstico
run_diagnosis() {
    log_header "DIAGNÓSTICO DEL SISTEMA"
    
    echo "🖥️  Información del sistema:"
    echo "  - Usuario actual: $(whoami)"
    echo "  - Hostname: $(hostname)"
    echo "  - OS: $(lsb_release -d 2>/dev/null | cut -f2 || uname -a)"
    echo "  - Fecha: $(date)"
    
    echo ""
    echo "🌐 Información de red:"
    echo "  - IP pública: $(curl -s ifconfig.me 2>/dev/null || echo "No disponible")"
    echo "  - IPs locales:"
    ip addr show | grep -E "inet.*scope global" | awk '{print "    - " $2}' | head -5
    
    echo ""
    chmod +x "$SCRIPT_DIR/ssh-setup.sh"
    "$SCRIPT_DIR/ssh-setup.sh"
}

# Función para configurar SSH
setup_ssh() {
    log_header "CONFIGURACIÓN SSH"
    
    read -p "¿Deseas configurar SSH de forma segura? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        chmod +x "$SCRIPT_DIR/setup-ssh-security.sh"
        "$SCRIPT_DIR/setup-ssh-security.sh"
    else
        log_info "Configuración SSH omitida"
    fi
}

# Función para configurar fail2ban
setup_fail2ban() {
    log_header "CONFIGURACIÓN FAIL2BAN"
    
    read -p "¿Deseas configurar fail2ban con tu IP en whitelist? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        chmod +x "$SCRIPT_DIR/setup-fail2ban.sh"
        "$SCRIPT_DIR/setup-fail2ban.sh"
    else
        log_info "Configuración fail2ban omitida"
    fi
}

# Función para configuración rápida
quick_setup() {
    log_header "CONFIGURACIÓN RÁPIDA"
    
    echo "⚡ Ejecutando configuración automática completa..."
    
    # 1. Diagnóstico
    run_diagnosis
    
    echo ""
    read -p "¿Continuar con la configuración automática? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Configuración cancelada"
        return
    fi
    
    # 2. SSH
    log_step "Configurando SSH..."
    chmod +x "$SCRIPT_DIR/setup-ssh-security.sh"
    "$SCRIPT_DIR/setup-ssh-security.sh" || log_warn "Error en configuración SSH"
    
    # 3. Fail2ban
    log_step "Configurando fail2ban..."
    chmod +x "$SCRIPT_DIR/setup-fail2ban.sh"
    "$SCRIPT_DIR/setup-fail2ban.sh" || log_warn "Error en configuración fail2ban"
    
    log_info "✅ Configuración rápida completada"
}

# Función para generar clave cliente
generate_client_key() {
    log_header "GENERAR CLAVE SSH CLIENTE"
    
    if command -v generate-betTerminal-key >/dev/null 2>&1; then
        generate-betTerminal-key
    else
        log_error "Script generate-betTerminal-key no encontrado"
        log_info "Ejecuta primero la configuración SSH"
    fi
}

# Función para mostrar estado
show_status() {
    log_header "ESTADO ACTUAL DEL SISTEMA"
    
    echo "🔐 SSH:"
    if systemctl is-active --quiet ssh; then
        echo "  - Estado: ✅ Activo"
        echo "  - Puerto: $(grep -E "^Port" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "22 (default)")"
        echo "  - Auth por clave: $(grep -E "^PubkeyAuthentication" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "default")"
        echo "  - Auth por contraseña: $(grep -E "^PasswordAuthentication" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "default")"
    else
        echo "  - Estado: ❌ Inactivo"
    fi
    
    echo ""
    echo "🛡️  Fail2ban:"
    if systemctl is-active --quiet fail2ban; then
        echo "  - Estado: ✅ Activo"
        if command -v fail2ban-client >/dev/null 2>&1; then
            echo "  - Jails activos:"
            sudo fail2ban-client status | grep "Jail list" | sed 's/.*:\s*/    /'
            
            echo "  - SSH jail:"
            if sudo fail2ban-client status sshd >/dev/null 2>&1; then
                BANNED_COUNT=$(sudo fail2ban-client status sshd | grep "Currently banned" | awk '{print $4}')
                echo "    - IPs bloqueadas: $BANNED_COUNT"
                IGNORED_IPS=$(sudo fail2ban-client get sshd ignoreip 2>/dev/null || echo "No configurado")
                echo "    - IPs en whitelist: $IGNORED_IPS"
            else
                echo "    - No configurado"
            fi
        fi
    else
        echo "  - Estado: ❌ Inactivo"
    fi
    
    echo ""
    echo "🔑 SSH Keys:"
    SSH_DIR="$HOME/.ssh"
    if [ -d "$SSH_DIR" ]; then
        if [ -f "$SSH_DIR/authorized_keys" ]; then
            KEY_COUNT=$(grep -c "^ssh-" "$SSH_DIR/authorized_keys" 2>/dev/null || echo "0")
            echo "  - Claves autorizadas: $KEY_COUNT"
        else
            echo "  - Archivo authorized_keys: ❌ No existe"
        fi
    else
        echo "  - Directorio .ssh: ❌ No existe"
    fi
    
    echo ""
    echo "🌐 Conectividad:"
    echo "  - IP pública: $(curl -s ifconfig.me 2>/dev/null || echo "No disponible")"
    echo "  - IPs locales:"
    ip addr show | grep -E "inet.*scope global" | awk '{print "    - " $2}' | head -3
}

# Función para reiniciar servicios
restart_services() {
    log_header "REINICIAR SERVICIOS"
    
    echo "🔄 Reiniciando servicios del sistema..."
    
    if systemctl is-active --quiet ssh; then
        echo "  - Reiniciando SSH..."
        sudo systemctl restart ssh && echo "    ✅ SSH reiniciado" || echo "    ❌ Error SSH"
    fi
    
    if systemctl is-active --quiet fail2ban; then
        echo "  - Reiniciando fail2ban..."
        sudo systemctl restart fail2ban && echo "    ✅ fail2ban reiniciado" || echo "    ❌ Error fail2ban"
    fi
    
    echo "✅ Servicios reiniciados"
}

# Loop principal del menú
while true; do
    show_menu
    read -p "Selecciona una opción (1-8): " choice
    
    case $choice in
        1)
            run_diagnosis
            ;;
        2)
            setup_ssh
            ;;
        3)
            setup_fail2ban
            ;;
        4)
            quick_setup
            ;;
        5)
            generate_client_key
            ;;
        6)
            show_status
            ;;
        7)
            restart_services
            ;;
        8)
            echo "👋 ¡Hasta luego!"
            exit 0
            ;;
        *)
            log_error "Opción inválida. Por favor selecciona 1-8."
            ;;
    esac
    
    echo ""
    read -p "Presiona Enter para continuar..." -r
done

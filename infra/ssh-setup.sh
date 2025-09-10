#!/bin/bash
set -euo pipefail

echo "🔑 Configurando SSH Keys y acceso seguro para BeTerminal..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar si somos root o tenemos sudo
if [[ $EUID -eq 0 ]]; then
    SUDO=""
else
    SUDO="sudo"
fi

# 1. Verificar configuración SSH actual
log_info "Verificando configuración SSH actual..."
echo "Usuario actual: $(whoami)"
echo "Directorio home: $HOME"

# 2. Verificar directorio .ssh
if [ ! -d "$HOME/.ssh" ]; then
    log_warn "Directorio .ssh no existe, creando..."
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
fi

# 3. Verificar permisos del directorio .ssh
CURRENT_PERMS=$(stat -c "%a" "$HOME/.ssh")
if [ "$CURRENT_PERMS" != "700" ]; then
    log_warn "Corrigiendo permisos del directorio .ssh..."
    chmod 700 "$HOME/.ssh"
fi

# 4. Listar keys existentes
log_info "SSH Keys existentes:"
ls -la "$HOME/.ssh/" | grep -E "\.(pub|key|pem)$" || echo "No se encontraron keys"

# 5. Verificar archivo authorized_keys
if [ -f "$HOME/.ssh/authorized_keys" ]; then
    log_info "Archivo authorized_keys encontrado:"
    echo "Número de keys: $(wc -l < "$HOME/.ssh/authorized_keys")"
    echo "Permisos: $(stat -c "%a" "$HOME/.ssh/authorized_keys")"
    
    # Corregir permisos si es necesario
    if [ "$(stat -c "%a" "$HOME/.ssh/authorized_keys")" != "600" ]; then
        log_warn "Corrigiendo permisos de authorized_keys..."
        chmod 600 "$HOME/.ssh/authorized_keys"
    fi
else
    log_warn "Archivo authorized_keys no existe, creando..."
    touch "$HOME/.ssh/authorized_keys"
    chmod 600 "$HOME/.ssh/authorized_keys"
fi

# 6. Verificar configuración del servidor SSH
log_info "Verificando configuración del servidor SSH..."
if [ -f "/etc/ssh/sshd_config" ]; then
    echo "PubkeyAuthentication: $(grep -E "^PubkeyAuthentication" /etc/ssh/sshd_config || echo "no configurado")"
    echo "PasswordAuthentication: $(grep -E "^PasswordAuthentication" /etc/ssh/sshd_config || echo "no configurado")"
    echo "AuthorizedKeysFile: $(grep -E "^AuthorizedKeysFile" /etc/ssh/sshd_config || echo "usando default")"
fi

# 7. Verificar si SSH está corriendo
if systemctl is-active --quiet ssh; then
    log_info "Servicio SSH está activo"
else
    log_error "Servicio SSH no está activo"
    echo "Para iniciarlo: sudo systemctl start ssh"
fi

# 8. Mostrar IP actual del servidor
log_info "IP actual del servidor:"
ip addr show | grep -E "inet.*scope global" | awk '{print $2}' | cut -d'/' -f1

# 9. Verificar estado de fail2ban
if systemctl is-active --quiet fail2ban; then
    log_info "fail2ban está activo"
    echo "IPs bloqueadas en sshd:"
    $SUDO fail2ban-client status sshd 2>/dev/null | grep "Banned IP list" || echo "No hay IPs bloqueadas"
else
    log_warn "fail2ban no está activo"
fi

echo ""
log_info "Diagnóstico completado. Para agregar tu clave SSH:"
echo "1. Copia tu clave pública (archivo .pub) al servidor"
echo "2. Ejecuta: cat tu_clave.pub >> ~/.ssh/authorized_keys"
echo "3. O usa: ssh-copy-id -i tu_clave.pub usuario@servidor"

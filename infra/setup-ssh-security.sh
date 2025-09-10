#!/bin/bash
set -euo pipefail

echo "🔐 Configurando acceso SSH seguro basado en hardware para BeTerminal..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Verificar permisos
if [[ $EUID -ne 0 ]] && ! sudo -n true 2>/dev/null; then
    log_error "Este script necesita permisos de administrador"
    exit 1
fi

SUDO=""
if [[ $EUID -ne 0 ]]; then
    SUDO="sudo"
fi

# Variables
SSH_CONFIG="/etc/ssh/sshd_config"
SSH_CONFIG_BACKUP="/etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)"
TARGET_USER=${1:-$(whoami)}

log_step "Configurando SSH para usuario: $TARGET_USER"

# 1. Backup de configuración actual
log_info "Creando backup de configuración SSH..."
$SUDO cp "$SSH_CONFIG" "$SSH_CONFIG_BACKUP"

# 2. Asegurar directorio .ssh del usuario
log_step "Configurando directorio .ssh para $TARGET_USER..."
USER_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)
SSH_DIR="$USER_HOME/.ssh"

if [ ! -d "$SSH_DIR" ]; then
    $SUDO mkdir -p "$SSH_DIR"
fi

$SUDO chown "$TARGET_USER:$TARGET_USER" "$SSH_DIR"
$SUDO chmod 700 "$SSH_DIR"

# Crear authorized_keys si no existe
if [ ! -f "$SSH_DIR/authorized_keys" ]; then
    $SUDO touch "$SSH_DIR/authorized_keys"
fi

$SUDO chown "$TARGET_USER:$TARGET_USER" "$SSH_DIR/authorized_keys"
$SUDO chmod 600 "$SSH_DIR/authorized_keys"

# 3. Configurar SSH server de forma segura
log_step "Configurando servidor SSH..."

# Crear configuración segura
cat > /tmp/sshd_config_secure << 'EOF'
# Puerto SSH (cambiar del 22 por defecto para mayor seguridad)
Port 22

# Protocolo 2 solamente
Protocol 2

# Configuración de autenticación
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys

# Deshabilitar autenticación por contraseña para mayor seguridad
# (comentar estas líneas si necesitas acceso temporal por contraseña)
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM no

# Configuración de root
PermitRootLogin no

# Configuración de usuarios
AllowUsers betTerminal-admin

# Configuración de red
ClientAliveInterval 60
ClientAliveCountMax 3
MaxAuthTries 3
MaxSessions 4

# Configuración de logging
SyslogFacility AUTH
LogLevel VERBOSE

# Deshabilitar forwarding para mayor seguridad
AllowTcpForwarding no
X11Forwarding no
AllowAgentForwarding no

# Configuración de banner
Banner /etc/ssh/banner

# Configuración adicional de seguridad
HostbasedAuthentication no
IgnoreRhosts yes
PermitEmptyPasswords no
PermitUserEnvironment no
EOF

# Aplicar configuración al archivo principal
log_info "Aplicando configuración de seguridad..."

# Reemplazar AllowUsers con el usuario correcto
sed -i "s/AllowUsers betTerminal-admin/AllowUsers $TARGET_USER/" /tmp/sshd_config_secure

# Backup y aplicar nueva configuración
$SUDO cp /tmp/sshd_config_secure "$SSH_CONFIG"

# 4. Crear banner de seguridad
log_step "Creando banner de seguridad..."
cat > /tmp/ssh_banner << 'EOF'
********************************************************************************
*                              BeTerminal Server                              *
*                             ACCESO AUTORIZADO SOLAMENTE                     *
*                                                                              *
* Este sistema es de uso privado. El acceso no autorizado está prohibido.     *
* Todas las actividades son monitoreadas y registradas.                       *
*                                                                              *
* Sistema protegido por fail2ban - IPs maliciosas serán bloqueadas            *
********************************************************************************
EOF

$SUDO mv /tmp/ssh_banner /etc/ssh/banner
$SUDO chmod 644 /etc/ssh/banner

# 5. Script para generar y configurar claves SSH del cliente
log_step "Creando script para generar claves SSH..."

cat > /tmp/generate-ssh-key.sh << 'EOF'
#!/bin/bash
# Script para generar clave SSH específica para BeTerminal

echo "🔑 Generando clave SSH para BeTerminal..."

# Configurar variables
KEY_NAME="betTerminal_$(hostname)_$(date +%Y%m%d)"
KEY_PATH="$HOME/.ssh/$KEY_NAME"
SERVER_IP=""
SERVER_USER=""

# Solicitar información del servidor
echo "Configuración del servidor BeTerminal:"
read -p "IP del servidor: " SERVER_IP
read -p "Usuario del servidor: " SERVER_USER

# Generar clave SSH con comentario identificativo
echo "Generando clave SSH..."
ssh-keygen -t ed25519 -f "$KEY_PATH" -C "BeTerminal-$(hostname)-$(whoami)-$(date +%Y%m%d)"

echo "✅ Clave generada:"
echo "  Clave privada: $KEY_PATH"
echo "  Clave pública: $KEY_PATH.pub"

# Mostrar clave pública
echo ""
echo "📋 Copia esta clave pública al servidor:"
echo "----------------------------------------"
cat "$KEY_PATH.pub"
echo "----------------------------------------"

# Crear configuración SSH local
echo ""
echo "📝 Configurando acceso SSH..."

# Crear entrada en config SSH
SSH_CONFIG_ENTRY="
# BeTerminal Server - $(date)
Host betTerminal
    HostName $SERVER_IP
    User $SERVER_USER
    IdentityFile $KEY_PATH
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
"

# Agregar a config SSH si no existe
if ! grep -q "Host betTerminal" "$HOME/.ssh/config" 2>/dev/null; then
    echo "$SSH_CONFIG_ENTRY" >> "$HOME/.ssh/config"
    chmod 600 "$HOME/.ssh/config"
    echo "✅ Configuración SSH agregada"
else
    echo "⚠️  Configuración SSH ya existe, actualiza manualmente si es necesario"
fi

echo ""
echo "🚀 Para copiar la clave al servidor, ejecuta:"
echo "ssh-copy-id -i $KEY_PATH.pub $SERVER_USER@$SERVER_IP"
echo ""
echo "🔗 Para conectarte después:"
echo "ssh betTerminal"
echo ""
echo "💡 Si cambias de IP, solo necesitas actualizar 'HostName' en ~/.ssh/config"
EOF

chmod +x /tmp/generate-ssh-key.sh
mv /tmp/generate-ssh-key.sh /usr/local/bin/generate-betTerminal-key

# 6. Script para agregar claves al servidor
cat > /tmp/add-ssh-key.sh << EOF
#!/bin/bash
# Script para agregar clave SSH al servidor BeTerminal

if [ \$# -ne 1 ]; then
    echo "Uso: \$0 <archivo_clave_publica>"
    echo "Ejemplo: \$0 /path/to/key.pub"
    exit 1
fi

KEY_FILE="\$1"
if [ ! -f "\$KEY_FILE" ]; then
    echo "Error: Archivo de clave no encontrado: \$KEY_FILE"
    exit 1
fi

echo "🔑 Agregando clave SSH al usuario $TARGET_USER..."

# Validar formato de clave
if ! ssh-keygen -l -f "\$KEY_FILE" >/dev/null 2>&1; then
    echo "Error: Archivo de clave inválido"
    exit 1
fi

# Agregar clave con comentario de fecha
echo "# Agregada el \$(date) desde \$(hostname)" >> "$SSH_DIR/authorized_keys"
cat "\$KEY_FILE" >> "$SSH_DIR/authorized_keys"

echo "✅ Clave SSH agregada exitosamente"
echo "📊 Total de claves autorizadas: \$(grep -c '^ssh-' "$SSH_DIR/authorized_keys")"
EOF

chmod +x /tmp/add-ssh-key.sh
$SUDO mv /tmp/add-ssh-key.sh /usr/local/bin/add-betTerminal-key

# 7. Validar configuración SSH
log_step "Validando configuración SSH..."
if $SUDO sshd -t; then
    log_info "✅ Configuración SSH válida"
else
    log_error "❌ Error en configuración SSH"
    log_info "Restaurando backup..."
    $SUDO cp "$SSH_CONFIG_BACKUP" "$SSH_CONFIG"
    exit 1
fi

# 8. Reiniciar SSH (con precaución)
log_step "Reiniciando servicio SSH..."
if $SUDO systemctl reload sshd; then
    log_info "✅ SSH reiniciado exitosamente"
else
    log_error "❌ Error al reiniciar SSH"
    log_info "Restaurando configuración..."
    $SUDO cp "$SSH_CONFIG_BACKUP" "$SSH_CONFIG"
    $SUDO systemctl reload sshd
    exit 1
fi

# 9. Mostrar resumen
echo ""
log_info "🎉 Configuración SSH completada!"
echo ""
echo "📋 Resumen de configuración:"
echo "  - Usuario permitido: $TARGET_USER"
echo "  - Autenticación por clave: ✅ Habilitada"
echo "  - Autenticación por contraseña: ❌ Deshabilitada"
echo "  - Root login: ❌ Deshabilitado"
echo "  - Logging: ✅ Verboso"
echo "  - Banner de seguridad: ✅ Habilitado"
echo ""
echo "🔑 Comandos útiles:"
echo "  - Generar clave para cliente: generate-betTerminal-key"
echo "  - Agregar clave al servidor: sudo add-betTerminal-key archivo.pub"
echo "  - Ver claves autorizadas: cat $SSH_DIR/authorized_keys"
echo "  - Validar SSH config: sudo sshd -t"
echo ""
echo "⚠️  IMPORTANTE:"
echo "  - Asegúrate de tener una clave SSH configurada ANTES de desconectarte"
echo "  - El backup de configuración está en: $SSH_CONFIG_BACKUP"
echo "  - Para acceso temporal por contraseña, edita $SSH_CONFIG"
echo ""
echo "🔄 Para que tu PC pueda conectarse con IP dinámica:"
echo "  1. Genera una clave SSH única para tu PC"
echo "  2. Agrega la clave pública al servidor"
echo "  3. Configura SSH config en tu PC con alias 'betTerminal'"
echo "  4. Solo necesitarás actualizar la IP en ~/.ssh/config cuando cambie"

# Limpiar archivos temporales
rm -f /tmp/sshd_config_secure

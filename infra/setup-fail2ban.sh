#!/bin/bash
set -euo pipefail

echo "🛡️  Configurando fail2ban con whitelist para BeTerminal..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Verificar si tenemos permisos de administrador
if [[ $EUID -ne 0 ]]; then
    if ! sudo -n true 2>/dev/null; then
        log_error "Este script necesita permisos de administrador. Ejecuta con sudo o asegúrate de tener acceso sudo."
        exit 1
    fi
    SUDO="sudo"
else
    SUDO=""
fi

# Función para detectar IP del cliente
detect_client_ip() {
    local ip=""
    
    # Intentar obtener IP de la variable SSH_CLIENT
    if [ -n "${SSH_CLIENT:-}" ]; then
        ip=$(echo $SSH_CLIENT | awk '{print $1}')
        echo "$ip"
        return 0
    fi
    
    # Intentar obtener IP de conexiones activas
    if command -v who >/dev/null 2>&1; then
        ip=$(who am i | awk '{print $5}' | tr -d '()')
        if [ -n "$ip" ] && [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "$ip"
            return 0
        fi
    fi
    
    # Fallback: pedir al usuario
    echo ""
    return 1
}

# 1. Instalar fail2ban si no está instalado
log_step "Verificando instalación de fail2ban..."
if ! command -v fail2ban-server >/dev/null 2>&1; then
    log_warn "fail2ban no está instalado. Instalando..."
    $SUDO apt update
    $SUDO apt install -y fail2ban
else
    log_info "fail2ban ya está instalado"
fi

# 2. Detectar IP del cliente
log_step "Detectando tu IP para whitelist..."
CLIENT_IP=$(detect_client_ip)

if [ -z "$CLIENT_IP" ]; then
    echo "No se pudo detectar automáticamente tu IP."
    echo "Por favor, ingresa tu IP actual (puedes encontrarla en https://whatismyipaddress.com/):"
    read -p "Tu IP: " CLIENT_IP
fi

if [[ ! "$CLIENT_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    log_error "IP inválida: $CLIENT_IP"
    exit 1
fi

log_info "IP detectada para whitelist: $CLIENT_IP"

# 3. Crear configuración de fail2ban
log_step "Configurando fail2ban..."

# Crear archivo de configuración local
cat > /tmp/jail.local << EOF
[DEFAULT]
# Whitelist de IPs que nunca serán bloqueadas
ignoreip = 127.0.0.1/8 ::1 $CLIENT_IP

# Tiempo de ban (en segundos) - 1 hora
bantime = 3600

# Tiempo de ventana para contar intentos fallidos (en segundos) - 10 minutos
findtime = 600

# Número máximo de intentos fallidos antes del ban
maxretry = 5

# Configuración de email (opcional)
# destemail = admin@beticket.net
# sendername = Fail2Ban-BeTerminal
# mta = sendmail

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 1800
findtime = 300

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 6

[nginx-noscript]
enabled = true
filter = nginx-noscript
logpath = /var/log/nginx/access.log
maxretry = 6

[nginx-badbots]
enabled = true
filter = nginx-badbots
logpath = /var/log/nginx/access.log
maxretry = 2

[nginx-noproxy]
enabled = true
filter = nginx-noproxy
logpath = /var/log/nginx/access.log
maxretry = 2
EOF

# Mover configuración a su lugar
$SUDO mv /tmp/jail.local /etc/fail2ban/jail.local

# 4. Crear filtro personalizado para el backend de BeTerminal
log_step "Creando filtros personalizados..."

cat > /tmp/betTerminal-auth.conf << EOF
[Definition]
failregex = ^.*"ip":"<HOST>".*"error":"(Invalid credentials|Unauthorized|Authentication failed)".*$
            ^.*<HOST>.*"POST /login.*HTTP/[0-9.]+" 401 .*$
            ^.*<HOST>.*"POST /auth.*HTTP/[0-9.]+" 401 .*$

ignoreregex =
EOF

$SUDO mv /tmp/betTerminal-auth.conf /etc/fail2ban/filter.d/betTerminal-auth.conf

# Agregar jail para BeTerminal
cat >> /tmp/jail.local.append << EOF

[betTerminal-auth]
enabled = true
filter = betTerminal-auth
logpath = /var/log/betTerminal/access.log
maxretry = 5
bantime = 1800
findtime = 300
EOF

$SUDO cat /tmp/jail.local.append >> /etc/fail2ban/jail.local
rm /tmp/jail.local.append

# 5. Reiniciar fail2ban
log_step "Reiniciando fail2ban..."
$SUDO systemctl restart fail2ban
$SUDO systemctl enable fail2ban

# 6. Verificar estado
log_step "Verificando configuración..."
sleep 2

echo ""
log_info "Estado de fail2ban:"
$SUDO systemctl status fail2ban --no-pager

echo ""
log_info "Jails activos:"
$SUDO fail2ban-client status

echo ""
log_info "Configuración SSH jail:"
$SUDO fail2ban-client status sshd

echo ""
log_info "IPs en whitelist:"
echo "- Localhost: 127.0.0.1/8"
echo "- IPv6 localhost: ::1"
echo "- Tu IP: $CLIENT_IP"

# 7. Crear script para agregar/quitar IPs de whitelist
cat > /tmp/manage-whitelist.sh << 'EOF'
#!/bin/bash
# Script para gestionar whitelist de fail2ban

usage() {
    echo "Uso: $0 {add|remove|list} [IP]"
    echo "  add IP    - Agregar IP al whitelist"
    echo "  remove IP - Quitar IP del whitelist"
    echo "  list      - Mostrar IPs en whitelist"
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

case "$1" in
    add)
        if [ -z "$2" ]; then
            echo "Error: Especifica la IP a agregar"
            exit 1
        fi
        echo "Agregando $2 al whitelist..."
        sudo fail2ban-client set sshd addignoreip $2
        echo "IP $2 agregada al whitelist"
        ;;
    remove)
        if [ -z "$2" ]; then
            echo "Error: Especifica la IP a quitar"
            exit 1
        fi
        echo "Quitando $2 del whitelist..."
        sudo fail2ban-client set sshd delignoreip $2
        echo "IP $2 quitada del whitelist"
        ;;
    list)
        echo "IPs en whitelist:"
        sudo fail2ban-client get sshd ignoreip
        ;;
    *)
        usage
        ;;
esac
EOF

$SUDO mv /tmp/manage-whitelist.sh /usr/local/bin/manage-whitelist
$SUDO chmod +x /usr/local/bin/manage-whitelist

echo ""
log_info "✅ Configuración de fail2ban completada!"
echo ""
echo "📋 Comandos útiles:"
echo "  - Ver estado: sudo fail2ban-client status"
echo "  - Ver jail SSH: sudo fail2ban-client status sshd"
echo "  - Agregar IP al whitelist: manage-whitelist add IP"
echo "  - Quitar IP del whitelist: manage-whitelist remove IP"
echo "  - Ver whitelist: manage-whitelist list"
echo "  - Desbanear IP: sudo fail2ban-client set sshd unbanip IP"
echo ""
echo "🔐 Tu IP ($CLIENT_IP) está en el whitelist y nunca será bloqueada."

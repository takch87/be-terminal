#!/bin/bash

echo "🔍 DIAGNÓSTICO SSH KEYS - BeTerminal"
echo "=================================="
echo

# 1. Verificar archivos SSH
echo "📁 1. Archivos SSH disponibles:"
ls -la ~/.ssh/ 2>/dev/null || echo "❌ Directorio ~/.ssh no existe"
echo

# 2. Verificar permisos
echo "🔐 2. Permisos de archivos SSH:"
if [ -d ~/.ssh ]; then
    echo "Directorio ~/.ssh: $(stat -c %a ~/.ssh)"
    if [ -f ~/.ssh/authorized_keys ]; then
        echo "authorized_keys: $(stat -c %a ~/.ssh/authorized_keys)"
    else
        echo "❌ authorized_keys no existe"
    fi
    if [ -f ~/.ssh/servidor_seguro ]; then
        echo "servidor_seguro (privada): $(stat -c %a ~/.ssh/servidor_seguro)"
    fi
    if [ -f ~/.ssh/servidor_seguro.pub ]; then
        echo "servidor_seguro.pub (pública): $(stat -c %a ~/.ssh/servidor_seguro.pub)"
    fi
else
    echo "❌ Directorio ~/.ssh no existe"
fi
echo

# 3. Verificar contenido de authorized_keys
echo "🗝️  3. Claves autorizadas:"
if [ -f ~/.ssh/authorized_keys ]; then
    echo "Número de claves: $(wc -l < ~/.ssh/authorized_keys)"
    while read -r line; do
        if [[ $line =~ ssh-[a-z0-9]+ ]]; then
            key_type=$(echo "$line" | awk '{print $1}')
            key_comment=$(echo "$line" | awk '{print $3}')
            echo "- Tipo: $key_type, Comentario: ${key_comment:-'Sin comentario'}"
        fi
    done < ~/.ssh/authorized_keys
else
    echo "❌ No hay archivo authorized_keys"
fi
echo

# 4. Verificar servicio SSH
echo "🔧 4. Estado del servicio SSH:"
systemctl is-active ssh >/dev/null 2>&1 && echo "✅ SSH activo" || echo "❌ SSH inactivo"
systemctl is-enabled ssh >/dev/null 2>&1 && echo "✅ SSH habilitado" || echo "❌ SSH deshabilitado"
echo

# 5. Verificar puerto SSH
echo "🌐 5. Puerto SSH:"
ss -tlnp | grep :22 >/dev/null && echo "✅ Puerto 22 abierto" || echo "❌ Puerto 22 cerrado"
echo

# 6. Verificar configuración SSH
echo "⚙️  6. Configuración SSH del servidor:"
if [ -f /etc/ssh/sshd_config ]; then
    echo "PubkeyAuthentication: $(sudo grep "^PubkeyAuthentication" /etc/ssh/sshd_config || echo "default (yes)")"
    echo "PasswordAuthentication: $(sudo grep "^PasswordAuthentication" /etc/ssh/sshd_config || echo "default (yes)")"
    echo "PermitRootLogin: $(sudo grep "^PermitRootLogin" /etc/ssh/sshd_config || echo "default (yes)")"
else
    echo "❌ No se puede leer /etc/ssh/sshd_config"
fi
echo

# 7. Verificar logs recientes
echo "📋 7. Últimos intentos de conexión SSH:"
sudo tail -10 /var/log/auth.log | grep sshd | tail -5
echo

# 8. Prueba de conexión interna
echo "🔬 8. Prueba de conexión SSH interna:"
timeout 5 ssh -o ConnectTimeout=3 -o BatchMode=yes -o PreferredAuthentications=publickey client_4752_1@localhost "echo 'SSH Key funciona!'" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ SSH con clave pública funciona correctamente"
else
    echo "❌ SSH con clave pública falló - puede requerir contraseña"
fi
echo

# 9. Información del sistema
echo "💻 9. Información del sistema:"
echo "Usuario actual: $(whoami)"
echo "IP del servidor: $(hostname -I | awk '{print $1}')"
echo "Hostname: $(hostname)"
echo

echo "🎯 RESUMEN:"
if [ -f ~/.ssh/authorized_keys ] && [ -d ~/.ssh ]; then
    echo "✅ Configuración SSH básica presente"
    if systemctl is-active ssh >/dev/null 2>&1; then
        echo "✅ Servicio SSH funcionando"
        echo "📡 Para probar desde cliente externo:"
        echo "   ssh -i tu_clave_privada client_4752_1@$(hostname -I | awk '{print $1}')"
    else
        echo "❌ Servicio SSH no está funcionando"
    fi
else
    echo "❌ Configuración SSH incompleta"
fi

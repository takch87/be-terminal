#!/bin/bash
set -euo pipefail

echo "🔐 Configurando SSL para BeTerminal..."

# Parar nginx si está corriendo
sudo systemctl stop nginx || true

# Crear directorio para webroot
sudo mkdir -p /var/www/certbot

# Generar certificados para ambos dominios
echo "📋 Generando certificado para be-terminal.beticket.net..."
sudo certbot certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email admin@beticket.net \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d be-terminal.beticket.net

echo "📋 Generando certificado para api.be-terminal.beticket.net..."
sudo certbot certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email admin@beticket.net \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d api.be-terminal.beticket.net

# Verificar que los certificados existen
if [[ -f "/etc/letsencrypt/live/be-terminal.beticket.net/fullchain.pem" ]] && [[ -f "/etc/letsencrypt/live/api.be-terminal.beticket.net/fullchain.pem" ]]; then
    echo "✅ Certificados SSL generados exitosamente"
    
    # Mostrar información de los certificados
    echo "📄 Información del certificado be-terminal.beticket.net:"
    sudo openssl x509 -in /etc/letsencrypt/live/be-terminal.beticket.net/fullchain.pem -text -noout | grep -E "(Subject:|Not After)"
    
    echo "📄 Información del certificado api.be-terminal.beticket.net:"
    sudo openssl x509 -in /etc/letsencrypt/live/api.be-terminal.beticket.net/fullchain.pem -text -noout | grep -E "(Subject:|Not After)"
else
    echo "❌ Error: No se pudieron generar los certificados SSL"
    exit 1
fi

echo "🚀 SSL configurado correctamente. Ahora puedes iniciar los servicios Docker."

#!/bin/bash
echo "🔧 Configurando SSL para BeTerminal..."

# Para SSL, necesitarías usar Cloudflare o un reverse proxy externo
# Por ahora, el sitio funciona en HTTP

echo "✅ BeTerminal está funcionando en:"
echo "🌐 Frontend: http://be.terminal.beticket.net"
echo "🔌 API: http://api.be.terminal.beticket.net"
echo ""
echo "🔑 Credenciales por defecto:"
echo "Usuario: admin"
echo "Contraseña: admin123"
echo ""
echo "📝 Para SSL en producción, recomiendo:"
echo "1. Usar Cloudflare con SSL/TLS automático"
echo "2. O configurar Let's Encrypt con certbot más nuevo"
echo "3. O usar un reverse proxy como Traefik"

# Verificar que el sitio responda
if curl -s http://be.terminal.beticket.net/healthz > /dev/null; then
    echo "✅ Backend funcionando correctamente"
else
    echo "❌ Backend no responde"
fi

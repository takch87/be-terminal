#!/bin/bash

echo "🔍 DIAGNÓSTICO API - BeTerminal Mobile App"
echo "==========================================="
echo

# Verificar servidor
echo "📡 1. Estado del Servidor:"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/health | grep -q "200"; then
    echo "✅ Servidor funcionando correctamente"
else
    echo "❌ Servidor no responde"
fi
echo

# Probar endpoints públicos de la app
echo "📱 2. Endpoints Públicos para App Móvil:"

echo -n "   /api/events: "
if curl -s -o /dev/null -w "%{http_code}" https://be.terminal.beticket.net/api/events | grep -q "200"; then
    echo "✅ OK"
else
    echo "❌ FALLO"
fi

echo -n "   /api/events/EVT001: "
if curl -s -o /dev/null -w "%{http_code}" https://be.terminal.beticket.net/api/events/EVT001 | grep -q "200"; then
    echo "✅ OK"
else
    echo "❌ FALLO"
fi

echo -n "   /api/stripe/publishable-key: "
if curl -s -o /dev/null -w "%{http_code}" https://be.terminal.beticket.net/api/stripe/publishable-key | grep -q "200"; then
    echo "✅ OK"
else
    echo "❌ FALLO"
fi

echo -n "   /api/health: "
if curl -s -o /dev/null -w "%{http_code}" https://be.terminal.beticket.net/api/health | grep -q "200"; then
    echo "✅ OK"
else
    echo "❌ FALLO"
fi

echo
echo "🔧 3. Endpoints Protegidos (requieren autenticación):"
echo "   /login - Login de usuarios"
echo "   /api/stripe/payment_intent - Crear intención de pago"
echo "   /api/stripe/config - Configuración de Stripe"
echo

echo "📊 4. Datos Disponibles:"
events_count=$(curl -s https://be.terminal.beticket.net/api/events | jq -r '.events | length' 2>/dev/null || echo "Error")
echo "   Eventos activos: $events_count"

publishable_key=$(curl -s https://be.terminal.beticket.net/api/stripe/publishable-key | jq -r '.publishable_key' 2>/dev/null | cut -c1-20)
echo "   Stripe Key: ${publishable_key}... (configurada)"

echo
echo "🚀 5. Para la App Android:"
echo "   Base URL: https://be.terminal.beticket.net"
echo "   Formato de respuesta: JSON con { success: true/false }"
echo "   CORS: Habilitado para todos los dominios"
echo "   HTTPS: Habilitado con certificado SSL válido"
echo

echo "📋 6. Últimos Logs del Servidor:"
cd /home/client_4752_1/be-terminal/services/backend-minimal
tail -5 server.log 2>/dev/null || echo "No se pueden leer los logs"

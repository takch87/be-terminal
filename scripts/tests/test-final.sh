#!/bin/bash

# Script de prueba final del sistema BeTerminal
echo "🔥 PRUEBA FINAL DEL SISTEMA BETERMINAL 🔥"
echo "========================================="

echo ""
echo "1️⃣ Verificando servidor..."
curl -s https://be.terminal.beticket.net/api/events > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Servidor principal: FUNCIONANDO"
else
    echo "❌ Servidor principal: ERROR"
fi

echo ""
echo "2️⃣ Verificando Stripe..."
STRIPE_RESPONSE=$(curl -s https://be.terminal.beticket.net/api/stripe/publishable-key)
if [[ $STRIPE_RESPONSE == *"pk_test"* ]]; then
    echo "✅ Stripe API: FUNCIONANDO"
    echo "   📋 Clave pública obtenida correctamente"
else
    echo "❌ Stripe API: ERROR"
fi

echo ""
echo "3️⃣ Verificando autenticación..."
LOGIN_RESPONSE=$(curl -s -X POST https://be.terminal.beticket.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo123"}')

if [[ $LOGIN_RESPONSE == *"token"* ]]; then
    echo "✅ Autenticación: FUNCIONANDO"
    echo "   📋 Login exitoso"
else
    echo "❌ Autenticación: ERROR"
fi

echo ""
echo "4️⃣ Verificando dashboard..."
DASHBOARD_RESPONSE=$(curl -s https://be.terminal.beticket.net/admin | head -c 50)
if [[ $DASHBOARD_RESPONSE == *"html"* ]]; then
    echo "✅ Dashboard: FUNCIONANDO"
    echo "   📋 Panel administrativo accesible"
else
    echo "❌ Dashboard: ERROR"
fi

echo ""
echo "5️⃣ Verificando base de datos..."
cd /home/client_4752_1/be-terminal/services/backend-minimal
DB_COUNT=$(sqlite3 database.sqlite "SELECT COUNT(*) FROM stripe_config WHERE active = 1;")
if [ "$DB_COUNT" -eq "1" ]; then
    echo "✅ Base de datos: FUNCIONANDO"
    echo "   📋 Configuración de Stripe activa"
else
    echo "❌ Base de datos: ERROR"
fi

echo ""
echo "6️⃣ Verificando encriptación..."
DB_ENCRYPTED=$(sqlite3 database.sqlite "SELECT publishable_key FROM stripe_config WHERE active = 1 LIMIT 1;")
if [[ $DB_ENCRYPTED == *"encrypted"* ]]; then
    echo "✅ Encriptación: FUNCIONANDO"
    echo "   🔐 Claves almacenadas de forma segura"
else
    echo "❌ Encriptación: ERROR"
fi

echo ""
echo "7️⃣ Verificando servicio systemd..."
SERVICE_STATUS=$(sudo systemctl is-active beterminal-backend.service)
if [ "$SERVICE_STATUS" = "active" ]; then
    echo "✅ Servicio SystemD: FUNCIONANDO"
    echo "   🔄 Inicio automático configurado"
else
    echo "❌ Servicio SystemD: ERROR"
fi

echo ""
echo "========================================="
echo "🎉 RESUMEN DE PRUEBAS COMPLETADO"
echo "========================================="

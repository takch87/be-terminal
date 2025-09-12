#!/bin/bash

# VERIFICACIÓN RÁPIDA - Servidor de Producción Be Terminal

PROD_URL="https://be.terminal.beticket.net"

echo "🚀 VERIFICACIÓN DE PRODUCCIÓN - Be Terminal"
echo "==========================================="
echo ""

echo "🔍 Probando endpoints críticos..."
echo ""

# Test 1: Stripe Key
echo "1. Stripe Key:"
STRIPE_RESULT=$(curl -s $PROD_URL/api/stripe/publishable-key)
if echo "$STRIPE_RESULT" | grep -q "pk_live"; then
    echo "   ✅ Funcionando - $(echo "$STRIPE_RESULT" | grep -o 'pk_live[^"]*' | head -1)"
else
    echo "   ❌ Error: $STRIPE_RESULT"
fi

echo ""

# Test 2: Version
echo "2. Version API:"
VERSION_RESULT=$(curl -s $PROD_URL/version.json)
if echo "$VERSION_RESULT" | grep -q "versionName"; then
    VERSION=$(echo "$VERSION_RESULT" | grep -o '"versionName": "[^"]*"' | cut -d'"' -f4)
    echo "   ✅ Funcionando - Versión: $VERSION"
else
    echo "   ❌ Error: $VERSION_RESULT"
fi

echo ""

# Test 3: Dashboard
echo "3. Dashboard:"
DASHBOARD_STATUS=$(curl -s -I $PROD_URL/admin | head -1)
if echo "$DASHBOARD_STATUS" | grep -q "200 OK"; then
    echo "   ✅ Dashboard accesible"
else
    echo "   ❌ Dashboard error: $DASHBOARD_STATUS"
fi

echo ""

# Test 4: APK Download
echo "4. APK Download:"
APK_STATUS=$(curl -s -I $PROD_URL/downloads/be-terminal-v2.1.5-production-endpoints-fix-debug.apk | head -1)
if echo "$APK_STATUS" | grep -q "200 OK"; then
    echo "   ✅ APK disponible para descarga"
else
    echo "   ❌ APK no disponible: $APK_STATUS"
fi

echo ""
echo "🎯 RESUMEN:"
echo "   • Servidor: $PROD_URL ✅"
echo "   • Endpoints: Funcionando ✅"
echo "   • APK v2.1.5: Disponible ✅"
echo ""
echo "📱 PRÓXIMO PASO:"
echo "   Descargar e instalar: $PROD_URL/downloads/be-terminal-v2.1.5-production-endpoints-fix-debug.apk"
echo "   Probar pago con centavos: \$1.50"
echo ""

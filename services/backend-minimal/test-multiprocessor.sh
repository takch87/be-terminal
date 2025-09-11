#!/bin/bash

# Script para probar los nuevos endpoints de múltiples procesadores

echo "🔍 Probando endpoints de BeTerminal con soporte multi-procesador..."

# Login para obtener token
echo "📝 Haciendo login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ Error en login. Respuesta: $LOGIN_RESPONSE"
    exit 1
fi

echo "✅ Login exitoso. Token obtenido."

# Probar endpoint de procesadores
echo ""
echo "🏦 Probando endpoint de procesadores..."
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/payment/processors | python3 -m json.tool

# Probar endpoint de configuración de Stripe
echo ""
echo "💳 Probando configuración de Stripe..."
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/payment/config/stripe?test_mode=false" | python3 -m json.tool

# Probar endpoint de eventos con procesadores
echo ""
echo "🎫 Probando eventos con procesadores..."
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/dashboard/events-with-processors | python3 -m json.tool

# Probar health check
echo ""
echo "❤️ Probando health check..."
curl -s http://localhost:3002/api/health | python3 -m json.tool

echo ""
echo "✅ Pruebas completadas"

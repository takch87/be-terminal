#!/bin/bash

# Script para configurar Adyen de prueba

TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "🏦 Configurando Adyen en modo Test..."

# Configurar Adyen Test
curl -s -X POST http://localhost:3002/api/payment/config/adyen \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "AQE1hmfuXNWTK0Qc+iSEHllyCGZUkPbLZtw=",
    "merchant_account": "TestMerchant",
    "hmac_key": "test_hmac_key_123",
    "return_url": "https://be.terminal.beticket.net/payment/return",
    "test_mode": true
  }' | python3 -m json.tool

echo ""
echo "✅ Configuración de Adyen Test completada"

# Verificar health check actualizado
echo ""
echo "❤️ Verificando health check..."
curl -s http://localhost:3002/api/health | python3 -m json.tool

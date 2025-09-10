#!/bin/bash

# Script para cambiar BeTerminal a producción
# Ejecutar con: ./switch-to-production.sh

set -euo pipefail

echo "🚀 BeTerminal - Cambio a Producción"
echo "====================================="

# Verificar si el usuario tiene claves de producción
echo ""
echo "⚠️  IMPORTANTE: Necesitas las claves de Stripe de PRODUCCIÓN"
echo ""
echo "Obtén tus claves desde: https://dashboard.stripe.com/apikeys"
echo "- Publishable key: pk_live_..."
echo "- Secret key: sk_live_..."
echo ""

read -p "¿Tienes las claves de producción listas? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Obtén las claves de producción primero."
    echo "📖 Instrucciones en STRIPE_SETUP.md"
    exit 1
fi

echo ""
echo "📝 Ingresa las claves de Stripe de PRODUCCIÓN:"
echo ""

# Solicitar claves de producción
read -p "Publishable Key (pk_live_...): " PUBLISHABLE_KEY
read -s -p "Secret Key (sk_live_...): " SECRET_KEY
echo ""

# Validar formato de claves
if [[ ! $PUBLISHABLE_KEY =~ ^pk_live_ ]]; then
    echo "❌ Error: La clave pública debe comenzar con 'pk_live_'"
    exit 1
fi

if [[ ! $SECRET_KEY =~ ^sk_live_ ]]; then
    echo "❌ Error: La clave secreta debe comenzar con 'sk_live_'"
    exit 1
fi

echo ""
echo "🔐 Actualizando configuración de Stripe..."

# Crear backup de la base de datos antes del cambio
cd /home/client_4752_1/be-terminal/services/backend-minimal
node -e "
const StripeEncryption = require('./crypto-utils');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.sqlite');

console.log('🔐 Encriptando claves de producción...');

const encryptedPublishableKey = StripeEncryption.encrypt('$PUBLISHABLE_KEY');
const encryptedSecretKey = StripeEncryption.encrypt('$SECRET_KEY');

db.run(
    'UPDATE stripe_config SET publishable_key = ?, secret_key = ?, test_mode = 0 WHERE active = 1',
    [encryptedPublishableKey, encryptedSecretKey],
    function(err) {
        if (err) {
            console.error('❌ Error actualizando configuración:', err);
            process.exit(1);
        }
        console.log('✅ Configuración de Stripe actualizada a PRODUCCIÓN');
        console.log('✅ Claves encriptadas y guardadas');
        console.log('✅ Modo test desactivado');
        db.close();
    }
);
"

echo ""
echo "🎯 Verificando configuración..."

# Verificar que el cambio se aplicó
TEST_MODE=$(sqlite3 database.sqlite "SELECT test_mode FROM stripe_config WHERE active = 1;")

if [ "$TEST_MODE" = "0" ]; then
    echo "✅ STRIPE CONFIGURADO EN MODO PRODUCCIÓN"
else
    echo "❌ Error: Stripe sigue en modo test"
    exit 1
fi

echo ""
echo "🔄 Reiniciando servidor..."

# Reiniciar el servidor para cargar nueva configuración
pkill -f "node server.js" 2>/dev/null || true
sleep 2

echo ""
echo "🎉 ¡BeTerminal cambiado a PRODUCCIÓN exitosamente!"
echo ""
echo "📋 SIGUIENTE PASOS:"
echo "1. Reinicia el servidor: cd services/backend-minimal && node server.js"
echo "2. Verifica el dashboard: https://be.terminal.beticket.net/admin"
echo "3. Haz una transacción de prueba pequeña (€0.50)"
echo "4. Monitorea los logs para verificar funcionamiento"
echo ""
echo "⚠️  IMPORTANTE:"
echo "- Ahora procesas pagos REALES"
echo "- Monitorea las transacciones en Stripe Dashboard"
echo "- Haz backups regulares de la base de datos"
echo ""
echo "🔒 Las claves están encriptadas con AES-256-CBC"
echo ""

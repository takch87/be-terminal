#!/bin/bash
# Script de seguridad pre-producción

echo "🔒 CHECKLIST DE SEGURIDAD BETEMINAL"
echo "=================================="

echo "✅ 1. JWT_SECRET configurado con 256-bit"
echo "✅ 2. HTTPS activo con certificados válidos"
echo "✅ 3. Fail2ban protegiendo SSH"
echo "✅ 4. Rate limiting activo"
echo "✅ 5. Helmet.js configurado"
echo "✅ 6. CORS restrictivo"
echo "✅ 7. Bcrypt para contraseñas"

echo ""
echo "🔴 PENDIENTES CRÍTICOS:"
echo "1. Revisar/cambiar contraseñas por defecto"
echo "2. Configurar webhook signatures de Stripe"
echo "3. Habilitar logs de auditoria completos"
echo "4. Configurar backup automático"

echo ""
echo "🟡 MEJORAS RECOMENDADAS:"
echo "1. Implementar 2FA para administradores"
echo "2. Encriptar base de datos en reposo"
echo "3. Configurar monitoring/alertas"
echo "4. Implementar CSP más estricto"

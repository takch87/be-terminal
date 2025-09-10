-- Script para cambiar a producción
-- Reemplaza las claves xxx con las reales de producción

UPDATE stripe_config 
SET 
    publishable_key = 'pk_live_TU_CLAVE_PUBLICA_DE_PRODUCCION',
    secret_key = 'sk_live_TU_CLAVE_SECRETA_DE_PRODUCCION',
    test_mode = 0
WHERE active = 1;

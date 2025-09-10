#!/usr/bin/env node
/**
 * Script para probar compatibilidad con claves no encriptadas
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const StripeEncryption = require('./crypto-utils.js');
const path = require('path');

const encryption = new StripeEncryption();
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Prueba de compatibilidad con claves no encriptadas...\n');

// Insertar claves en texto plano (como estaban antes)
const testPubKey = 'pk_test_compatibility_test_key_12345';
const testSecKey = 'sk_test_compatibility_test_key_67890';

console.log('📝 Insertando claves en texto plano...');
console.log(`Publishable: ${testPubKey}`);
console.log(`Secret: ${testSecKey}`);

// Desactivar configuraciones existentes
db.run('UPDATE stripe_config SET active = 0', (err) => {
    if (err) {
        console.error('❌ Error desactivando configs:', err);
        return;
    }
    
    // Insertar configuración en texto plano
    db.run(
        'INSERT INTO stripe_config (publishable_key, secret_key, test_mode, active) VALUES (?, ?, ?, 1)',
        [testPubKey, testSecKey, 1],
        function(err) {
            if (err) {
                console.error('❌ Error insertando config:', err);
                return;
            }
            
            console.log(`✅ Configuración en texto plano insertada con ID: ${this.lastID}`);
            
            // Probar que el sistema puede cargar claves no encriptadas
            console.log('\n🔍 Probando carga de claves no encriptadas...');
            
            db.get('SELECT * FROM stripe_config WHERE active = 1', (err, row) => {
                if (err) {
                    console.error('❌ Error leyendo config:', err);
                    return;
                }
                
                if (row) {
                    console.log('\n📋 Datos en base de datos:');
                    console.log(`Publishable: ${row.publishable_key}`);
                    console.log(`Secret: ${row.secret_key}`);
                    
                    // Simular el proceso de carga del servidor
                    console.log('\n🔓 Simulando proceso de carga del servidor...');
                    
                    try {
                        let secretKey, publishableKey;
                        
                        // Intentar desencriptar o usar valor directo si no está encriptado
                        if (typeof row.secret_key === 'string' && row.secret_key.startsWith('{')) {
                            console.log('🔐 Secret key parece encriptada, desencriptando...');
                            const encryptedSecret = JSON.parse(row.secret_key);
                            secretKey = encryption.decrypt(encryptedSecret);
                        } else {
                            console.log('📝 Secret key en texto plano, usando directamente...');
                            secretKey = row.secret_key;
                        }
                        
                        if (typeof row.publishable_key === 'string' && row.publishable_key.startsWith('{')) {
                            console.log('🔐 Publishable key parece encriptada, desencriptando...');
                            const encryptedPub = JSON.parse(row.publishable_key);
                            publishableKey = encryption.decrypt(encryptedPub);
                        } else {
                            console.log('📝 Publishable key en texto plano, usando directamente...');
                            publishableKey = row.publishable_key;
                        }
                        
                        console.log('\n✅ Resultado:');
                        console.log(`Secret Key cargada: ${secretKey}`);
                        console.log(`Publishable Key cargada: ${publishableKey}`);
                        
                        // Verificar coincidencia
                        const secretMatch = testSecKey === secretKey;
                        const pubMatch = testPubKey === publishableKey;
                        
                        console.log('\n🎯 Verificación:');
                        console.log(`Secret coincide: ${secretMatch ? '✅' : '❌'}`);
                        console.log(`Publishable coincide: ${pubMatch ? '✅' : '❌'}`);
                        
                        if (secretMatch && pubMatch) {
                            console.log('\n🎉 ¡Compatibilidad con claves no encriptadas funcionando!');
                            console.log('💡 El sistema puede manejar tanto claves encriptadas como no encriptadas.');
                        } else {
                            console.log('\n❌ Error en la compatibilidad');
                        }
                        
                    } catch (error) {
                        console.error('❌ Error en el proceso de carga:', error);
                    }
                } else {
                    console.log('❌ No se encontró configuración');
                }
                
                db.close();
            });
        }
    );
});

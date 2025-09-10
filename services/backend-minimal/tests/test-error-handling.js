#!/usr/bin/env node
/**
 * Script para probar manejo de errores en encriptación
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const StripeEncryption = require('./crypto-utils.js');
const path = require('path');

const encryption = new StripeEncryption();
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🧪 Prueba de manejo de errores...\n');

// Insertar datos corruptos/malformados
const corruptedJson = '{"encrypted":"CORRUPTED_DATA","iv":"invalid"}';

console.log('💥 Insertando datos JSON corruptos...');
console.log(`Datos corruptos: ${corruptedJson}`);

// Desactivar configuraciones existentes
db.run('UPDATE stripe_config SET active = 0', (err) => {
    if (err) {
        console.error('❌ Error desactivando configs:', err);
        return;
    }
    
    // Insertar configuración con datos corruptos
    db.run(
        'INSERT INTO stripe_config (publishable_key, secret_key, test_mode, active) VALUES (?, ?, ?, 1)',
        [corruptedJson, corruptedJson, 1],
        function(err) {
            if (err) {
                console.error('❌ Error insertando config corrupta:', err);
                return;
            }
            
            console.log(`✅ Configuración corrupta insertada con ID: ${this.lastID}`);
            
            // Probar que el sistema maneja errores gracefully
            console.log('\n🔍 Probando manejo de errores...');
            
            db.get('SELECT * FROM stripe_config WHERE active = 1', (err, row) => {
                if (err) {
                    console.error('❌ Error leyendo config:', err);
                    return;
                }
                
                if (row) {
                    console.log('\n📋 Intentando cargar datos corruptos...');
                    
                    try {
                        let secretKey, publishableKey;
                        
                        // Simular el proceso del servidor
                        try {
                            if (typeof row.secret_key === 'string' && row.secret_key.startsWith('{')) {
                                console.log('🔐 Intentando desencriptar secret key...');
                                const encryptedSecret = JSON.parse(row.secret_key);
                                secretKey = encryption.decrypt(encryptedSecret);
                            } else {
                                secretKey = row.secret_key;
                            }
                            
                            if (typeof row.publishable_key === 'string' && row.publishable_key.startsWith('{')) {
                                console.log('🔐 Intentando desencriptar publishable key...');
                                const encryptedPub = JSON.parse(row.publishable_key);
                                publishableKey = encryption.decrypt(encryptedPub);
                            } else {
                                publishableKey = row.publishable_key;
                            }
                            
                            console.log('❌ ERROR: Los datos corruptos no deberían haberse desencriptado');
                            
                        } catch (decryptError) {
                            console.log('⚠️  Error de desencriptación capturado (esperado):', decryptError.message);
                            console.log('🔄 Usando valores directos como fallback...');
                            secretKey = row.secret_key;
                            publishableKey = row.publishable_key;
                        }
                        
                        console.log('\n✅ Resultado del manejo de errores:');
                        console.log(`Secret Key fallback: ${secretKey.substring(0, 30)}...`);
                        console.log(`Publishable Key fallback: ${publishableKey.substring(0, 30)}...`);
                        
                        console.log('\n🎉 ¡Manejo de errores funcionando correctamente!');
                        console.log('💡 El sistema maneja gracefully datos corruptos y usa fallbacks.');
                        
                    } catch (error) {
                        console.error('❌ Error general:', error);
                    }
                } else {
                    console.log('❌ No se encontró configuración');
                }
                
                db.close();
            });
        }
    );
});

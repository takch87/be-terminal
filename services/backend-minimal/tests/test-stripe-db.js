#!/usr/bin/env node
/**
 * Script para insertar configuración de Stripe de prueba y verificar encriptación
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const StripeEncryption = require('./crypto-utils.js');
const path = require('path');

const encryption = new StripeEncryption();
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔐 Prueba de inserción y encriptación de Stripe...\n');

// Claves de prueba (sustituir con las reales al usar)
const testPublishableKey = 'pk_test_PLACEHOLDER_KEY_FOR_TESTING_PURPOSES_ONLY';
const testSecretKey = 'sk_test_PLACEHOLDER_KEY_FOR_TESTING_PURPOSES_ONLY';

console.log('📝 Claves originales:');
console.log(`Publishable: ${testPublishableKey.substring(0, 20)}...`);
console.log(`Secret: ${testSecretKey.substring(0, 20)}...`);

console.log('\n🔒 Encriptando claves...');
const encryptedPub = JSON.stringify(encryption.encrypt(testPublishableKey));
const encryptedSec = JSON.stringify(encryption.encrypt(testSecretKey));

console.log(`Publishable encriptada: ${encryptedPub.substring(0, 50)}...`);
console.log(`Secret encriptada: ${encryptedSec.substring(0, 50)}...`);

console.log('\n💾 Insertando en base de datos...');

// Primero desactivar configuraciones existentes
db.run('UPDATE stripe_config SET active = 0', (err) => {
    if (err) {
        console.error('❌ Error desactivando configs:', err);
        return;
    }
    
    // Insertar nueva configuración encriptada
    db.run(
        'INSERT INTO stripe_config (publishable_key, secret_key, test_mode, active) VALUES (?, ?, ?, 1)',
        [encryptedPub, encryptedSec, 1],
        function(err) {
            if (err) {
                console.error('❌ Error insertando config:', err);
                return;
            }
            
            console.log(`✅ Configuración insertada con ID: ${this.lastID}`);
            
            // Verificar que se puede leer y desencriptar
            console.log('\n🔍 Verificando lectura y desencriptación...');
            
            db.get('SELECT * FROM stripe_config WHERE active = 1', (err, row) => {
                if (err) {
                    console.error('❌ Error leyendo config:', err);
                    return;
                }
                
                if (row) {
                    console.log('\n📋 Datos en base de datos:');
                    console.log(`ID: ${row.id}`);
                    console.log(`Publishable (encriptada): ${row.publishable_key.substring(0, 50)}...`);
                    console.log(`Secret (encriptada): ${row.secret_key.substring(0, 50)}...`);
                    console.log(`Test Mode: ${row.test_mode}`);
                    console.log(`Active: ${row.active}`);
                    
                    // Desencriptar
                    console.log('\n🔓 Desencriptando...');
                    try {
                        const pubParsed = JSON.parse(row.publishable_key);
                        const secParsed = JSON.parse(row.secret_key);
                        
                        const decryptedPub = encryption.decrypt(pubParsed);
                        const decryptedSec = encryption.decrypt(secParsed);
                        
                        console.log(`Publishable desencriptada: ${decryptedPub.substring(0, 20)}...`);
                        console.log(`Secret desencriptada: ${decryptedSec.substring(0, 20)}...`);
                        
                        // Verificar coincidencia
                        const pubMatch = testPublishableKey === decryptedPub;
                        const secMatch = testSecretKey === decryptedSec;
                        
                        console.log('\n✅ Verificación:');
                        console.log(`Publishable coincide: ${pubMatch ? '✅' : '❌'}`);
                        console.log(`Secret coincide: ${secMatch ? '✅' : '❌'}`);
                        
                        if (pubMatch && secMatch) {
                            console.log('\n🎉 ¡Encriptación y desencriptación funcionando perfectamente!');
                            console.log('🔐 Las claves de Stripe están siendo almacenadas de forma segura.');
                        } else {
                            console.log('\n❌ Error: Las claves no coinciden después de desencriptar');
                        }
                        
                    } catch (decryptError) {
                        console.error('❌ Error desencriptando:', decryptError);
                    }
                } else {
                    console.log('❌ No se encontró configuración activa');
                }
                
                db.close();
            });
        }
    );
});

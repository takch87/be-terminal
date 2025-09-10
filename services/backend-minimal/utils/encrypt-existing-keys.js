#!/usr/bin/env node
/**
 * Script de migración para encriptar claves de Stripe existentes
 */

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

// Clase de encriptación
class StripeEncryption {
    constructor() {
        // Usar clave desde environment o generar una por defecto
        if (process.env.STRIPE_ENCRYPTION_KEY) {
            this.encryptionKey = Buffer.from(process.env.STRIPE_ENCRYPTION_KEY, 'hex');
        } else {
            console.warn('[WARN] No STRIPE_ENCRYPTION_KEY definida, usando clave por defecto');
            this.encryptionKey = crypto.scryptSync('BeTerminal-Stripe-Secret', 'salt', 32);
        }
    }

    encrypt(text) {
        if (!text) return null;
        
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return {
            encrypted,
            iv: iv.toString('hex')
        };
    }

    decrypt(encryptedData) {
        if (!encryptedData || typeof encryptedData !== 'object') {
            return encryptedData;
        }
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, Buffer.from(encryptedData.iv, 'hex'));
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}

const encryption = new StripeEncryption();

// Conectar a la base de datos
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔐 Iniciando migración de encriptación de claves de Stripe...');

db.all('SELECT * FROM stripe_config', (err, rows) => {
    if (err) {
        console.error('❌ Error leyendo configuraciones:', err);
        return;
    }

    if (!rows || rows.length === 0) {
        console.log('ℹ️  No hay configuraciones de Stripe para migrar');
        db.close();
        return;
    }

    console.log(`📋 Encontradas ${rows.length} configuraciones para migrar`);

    let migrated = 0;
    let skipped = 0;

    rows.forEach((row, index) => {
        // Verificar si ya está encriptado
        const isSecretEncrypted = typeof row.secret_key === 'string' && row.secret_key.startsWith('{');
        const isPubEncrypted = typeof row.publishable_key === 'string' && row.publishable_key.startsWith('{');

        if (isSecretEncrypted && isPubEncrypted) {
            console.log(`⏭️  Configuración ID ${row.id} ya está encriptada, omitiendo...`);
            skipped++;
            return;
        }

        try {
            // Encriptar claves
            const encryptedSecret = JSON.stringify(encryption.encrypt(row.secret_key));
            const encryptedPub = JSON.stringify(encryption.encrypt(row.publishable_key));

            // Actualizar en la base de datos
            db.run(
                'UPDATE stripe_config SET secret_key = ?, publishable_key = ? WHERE id = ?',
                [encryptedSecret, encryptedPub, row.id],
                function(updateErr) {
                    if (updateErr) {
                        console.error(`❌ Error actualizando configuración ID ${row.id}:`, updateErr);
                    } else {
                        console.log(`✅ Configuración ID ${row.id} encriptada exitosamente`);
                        migrated++;
                    }

                    // Si es la última fila, cerrar la conexión
                    if (index === rows.length - 1) {
                        setTimeout(() => {
                            console.log('\n📊 Resumen de migración:');
                            console.log(`   - Configuraciones migradas: ${migrated}`);
                            console.log(`   - Configuraciones omitidas: ${skipped}`);
                            console.log(`   - Total procesadas: ${migrated + skipped}`);
                            console.log('\n🎉 Migración completada');
                            db.close();
                        }, 1000);
                    }
                }
            );

        } catch (encryptError) {
            console.error(`❌ Error encriptando configuración ID ${row.id}:`, encryptError);
        }
    });
});

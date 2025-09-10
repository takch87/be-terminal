#!/usr/bin/env node
/**
 * Script de prueba para verificar la encriptación de Stripe
 */

require('dotenv').config();
const StripeEncryption = require('./crypto-utils.js');

const encryption = new StripeEncryption();

// Claves de prueba de Stripe (sustituir con las reales al usar)
const testPublishableKey = 'pk_test_PLACEHOLDER_KEY_FOR_TESTING_PURPOSES_ONLY';
const testSecretKey = 'sk_test_PLACEHOLDER_KEY_FOR_TESTING_PURPOSES_ONLY';

console.log('🔐 Prueba de encriptación de claves Stripe');
console.log('=' * 50);

console.log('\n📝 Claves originales:');
console.log(`Publishable: ${testPublishableKey.substring(0, 20)}...`);
console.log(`Secret: ${testSecretKey.substring(0, 20)}...`);

console.log('\n🔒 Encriptando...');
const encryptedPub = encryption.encrypt(testPublishableKey);
const encryptedSec = encryption.encrypt(testSecretKey);

console.log(`Publishable encriptada: ${JSON.stringify(encryptedPub).substring(0, 80)}...`);
console.log(`Secret encriptada: ${JSON.stringify(encryptedSec).substring(0, 80)}...`);

console.log('\n🔓 Desencriptando...');
const decryptedPub = encryption.decrypt(encryptedPub);
const decryptedSec = encryption.decrypt(encryptedSec);

console.log(`Publishable desencriptada: ${decryptedPub.substring(0, 20)}...`);
console.log(`Secret desencriptada: ${decryptedSec.substring(0, 20)}...`);

console.log('\n✅ Verificación:');
console.log(`Publishable coincide: ${testPublishableKey === decryptedPub ? '✅' : '❌'}`);
console.log(`Secret coincide: ${testSecretKey === decryptedSec ? '✅' : '❌'}`);

if (testPublishableKey === decryptedPub && testSecretKey === decryptedSec) {
    console.log('\n🎉 ¡Encriptación funcionando correctamente!');
} else {
    console.log('\n❌ Error en la encriptación');
}

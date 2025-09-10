// Script para consultar el estado de un Payment Intent en Stripe
const stripe = require('stripe');
const sqlite3 = require('sqlite3').verbose();
const StripeEncryption = require('./crypto-utils');

async function checkPaymentIntent(paymentIntentId) {
    // Cargar configuración de Stripe
    const db = new sqlite3.Database('database.sqlite');
    const stripeEncryption = new StripeEncryption();
    
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM stripe_config WHERE active = 1', async (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            try {
                // Desencriptar claves
                let secretKey;
                if (typeof row.secret_key === 'string' && row.secret_key.startsWith('{')) {
                    const encryptedSecret = JSON.parse(row.secret_key);
                    secretKey = stripeEncryption.decrypt(encryptedSecret);
                } else {
                    secretKey = row.secret_key;
                }
                
                // Inicializar Stripe
                const stripeClient = stripe(secretKey);
                
                // Consultar Payment Intent
                const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
                
                console.log('🔍 Payment Intent Details:');
                console.log('ID:', paymentIntent.id);
                console.log('Amount:', paymentIntent.amount, 'cents ($' + (paymentIntent.amount/100).toFixed(2) + ')');
                console.log('Status:', paymentIntent.status);
                console.log('Client Secret:', paymentIntent.client_secret ? 'Present' : 'Missing');
                console.log('Payment Method:', paymentIntent.payment_method || 'Not attached');
                console.log('Last Payment Error:', paymentIntent.last_payment_error || 'None');
                console.log('Created:', new Date(paymentIntent.created * 1000).toISOString());
                console.log('Currency:', paymentIntent.currency);
                console.log('Confirmation Method:', paymentIntent.confirmation_method);
                console.log('Metadata:', paymentIntent.metadata);
                
                if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
                    console.log('\n💳 Charges:');
                    paymentIntent.charges.data.forEach((charge, index) => {
                        console.log(`  Charge ${index + 1}:`, charge.status, charge.outcome?.type, charge.failure_message || 'Success');
                    });
                }
                
                db.close();
                resolve(paymentIntent);
                
            } catch (error) {
                console.error('❌ Error consulting Stripe:', error.message);
                db.close();
                reject(error);
            }
        });
    });
}

// Usar el ID del último payment intent
const paymentIntentId = process.argv[2] || 'pi_3S5fxVAts6Gh9pRN07WGUv4h';
checkPaymentIntent(paymentIntentId).catch(console.error);

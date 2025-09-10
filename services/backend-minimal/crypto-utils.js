const crypto = require('crypto');

class StripeEncryption {
    constructor() {
        // Usar clave desde environment o generar una por defecto
        if (process.env.STRIPE_ENCRYPTION_KEY) {
            this.encryptionKey = Buffer.from(process.env.STRIPE_ENCRYPTION_KEY, 'hex');
        } else {
            console.warn('[WARN] No STRIPE_ENCRYPTION_KEY definida, usando JWT_SECRET como base');
            this.encryptionKey = crypto.scryptSync(process.env.JWT_SECRET || 'fallback', 'stripe-salt', 32);
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

    // Método para verificar si un dato está encriptado
    isEncrypted(data) {
        return data && typeof data === 'object' && data.iv && data.authTag && data.encrypted;
    }
}

module.exports = StripeEncryption;

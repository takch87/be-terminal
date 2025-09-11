const StripeEncryption = require('./crypto-utils');

class PaymentProcessorManager {
    constructor(db) {
        this.db = db;
        this.encryption = new StripeEncryption();
        this.processors = new Map();
        this.stripe = null;
    this.adyen = null;
    }

    /**
     * Cargar configuraciones de procesadores
     */
    async loadProcessorConfigs() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    pp.name as processor_name,
                    pp.display_name,
                    pc.config_key,
                    pc.config_value,
                    pc.encrypted,
                    pc.test_mode,
                    pc.active
                FROM payment_processors pp
                JOIN payment_configs pc ON pp.id = pc.processor_id
                WHERE pp.active = 1 AND pc.active = 1
            `;
            
            this.db.all(query, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }

                const configs = {};
                
                rows.forEach(row => {
                    if (!configs[row.processor_name]) {
                        configs[row.processor_name] = {
                            display_name: row.display_name,
                            test_mode: row.test_mode,
                            config: {}
                        };
                    }
                    
                    let value = row.config_value;
                    if (row.encrypted && value) {
                        try {
                            const encryptedData = JSON.parse(value);
                            value = this.encryption.decrypt(encryptedData);
                        } catch (error) {
                            console.error(`Error decrypting ${row.processor_name}:${row.config_key}:`, error);
                            value = null;
                        }
                    }
                    
                    configs[row.processor_name].config[row.config_key] = value;
                });

                resolve(configs);
            });
        });
    }

    /**
     * Inicializar procesadores con sus configuraciones
     */
    async initializeProcessors() {
        try {
            const configs = await this.loadProcessorConfigs();
            
            // Inicializar Stripe
            if (configs.stripe && configs.stripe.config.secret_key) {
                const stripe = require('stripe')(configs.stripe.config.secret_key);
                this.stripe = stripe;
                this.processors.set('stripe', {
                    client: stripe,
                    config: configs.stripe,
                    type: 'stripe'
                });
                console.log('[INFO] Stripe configurado correctamente');
            }

            // Adyen removed (Stripe-only)

            return true;
        } catch (error) {
            console.error('[ERROR] Error inicializando procesadores:', error);
            return false;
        }
    }

    /**
     * Obtener procesador por nombre
     */
    getProcessor(name) {
        return this.processors.get(name);
    }

    /**
     * Obtener lista de procesadores activos
     */
    getActiveProcessors() {
        return Array.from(this.processors.keys());
    }

    /**
     * Guardar configuración de procesador
     */
    async saveProcessorConfig(processorName, configData, testMode = true) {
        return new Promise((resolve, reject) => {
            // Primero obtener el processor_id
            this.db.get(
                'SELECT id FROM payment_processors WHERE name = ?',
                [processorName],
                (err, processor) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!processor) {
                        reject(new Error(`Procesador ${processorName} no encontrado`));
                        return;
                    }

                    // Desactivar configuración anterior y eliminar registros existentes
                    this.db.run(
                        'DELETE FROM payment_configs WHERE processor_id = ? AND test_mode = ?',
                        [processor.id, testMode ? 1 : 0],
                        (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            // Insertar nueva configuración
                            const configEntries = Object.entries(configData);
                            let completed = 0;
                            let hasError = false;

                            configEntries.forEach(([key, value]) => {
                                // Encriptar valores sensibles
                                const shouldEncrypt = key.includes('key') || key.includes('secret');
                                let finalValue = value;
                                let encrypted = 0;

                                if (shouldEncrypt && value) {
                                    try {
                                        finalValue = JSON.stringify(this.encryption.encrypt(value));
                                        encrypted = 1;
                                    } catch (error) {
                                        console.error(`Error encriptando ${key}:`, error);
                                    }
                                }

                                this.db.run(
                                    `INSERT INTO payment_configs 
                                     (processor_id, config_name, config_key, config_value, encrypted, test_mode, active) 
                                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [processor.id, key, key, finalValue, encrypted, testMode ? 1 : 0, 1],
                                    (err) => {
                                        if (err && !hasError) {
                                            hasError = true;
                                            reject(err);
                                            return;
                                        }
                                        
                                        completed++;
                                        if (completed === configEntries.length && !hasError) {
                                            resolve(true);
                                        }
                                    }
                                );
                            });
                        }
                    );
                }
            );
        });
    }

    /**
     * Obtener configuración de un procesador
     */
    async getProcessorConfig(processorName, testMode = true) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT pc.config_key, pc.config_value, pc.encrypted
                FROM payment_processors pp
                JOIN payment_configs pc ON pp.id = pc.processor_id
                WHERE pp.name = ? AND pc.test_mode = ? AND pc.active = 1
            `;
            
            this.db.all(query, [processorName, testMode ? 1 : 0], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }

                const config = {};
                rows.forEach(row => {
                    let value = row.config_value;
                    if (row.encrypted && value) {
                        try {
                            const encryptedData = JSON.parse(value);
                            value = this.encryption.decrypt(encryptedData);
                        } catch (error) {
                            console.error(`Error decrypting ${row.config_key}:`, error);
                            value = '***ENCRYPTED***';
                        }
                    }
                    config[row.config_key] = value;
                });

                resolve(config);
            });
        });
    }
}

module.exports = PaymentProcessorManager;

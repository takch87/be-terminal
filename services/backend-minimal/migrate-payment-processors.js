const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

console.log('🔄 Iniciando migración para soporte multi-procesador...');

// Script de migración para agregar soporte a múltiples procesadores de pago
const migrations = [
    // 1. Crear tabla de procesadores de pago
    `CREATE TABLE IF NOT EXISTS payment_processors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // 2. Crear tabla de configuraciones de procesadores
    `CREATE TABLE IF NOT EXISTS payment_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        processor_id INTEGER NOT NULL,
        config_name TEXT NOT NULL,
        config_key TEXT NOT NULL,
        config_value TEXT,
        encrypted INTEGER DEFAULT 0,
        test_mode INTEGER DEFAULT 1,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (processor_id) REFERENCES payment_processors(id),
        UNIQUE(processor_id, config_name, test_mode)
    )`,
    
    // 3. Agregar columna processor_id a eventos
    `ALTER TABLE events ADD COLUMN processor_id INTEGER DEFAULT 1`,
    
    // 4. Agregar columna processor_type a transacciones
    `ALTER TABLE transactions ADD COLUMN processor_type TEXT DEFAULT 'stripe'`,
    
    // 5. Insertar procesadores por defecto (Stripe solamente)
    `INSERT OR IGNORE INTO payment_processors (id, name, display_name, description) VALUES 
        (1, 'stripe', 'Stripe', 'Stripe payment processor')`,
    
    // 6. Migrar configuración existente de Stripe
    `INSERT OR IGNORE INTO payment_configs 
        (processor_id, config_name, config_key, config_value, encrypted, test_mode, active)
        SELECT 
            1 as processor_id,
            'main' as config_name,
            'secret_key' as config_key,
            secret_key as config_value,
            1 as encrypted,
            test_mode,
            active
        FROM stripe_config WHERE active = 1 LIMIT 1`,
    
    `INSERT OR IGNORE INTO payment_configs 
        (processor_id, config_name, config_key, config_value, encrypted, test_mode, active)
        SELECT 
            1 as processor_id,
            'main' as config_name,
            'publishable_key' as config_key,
            publishable_key as config_value,
            1 as encrypted,
            test_mode,
            active
        FROM stripe_config WHERE active = 1 LIMIT 1`
];

async function runMigrations() {
    for (let i = 0; i < migrations.length; i++) {
        try {
            await new Promise((resolve, reject) => {
                db.run(migrations[i], function(err) {
                    if (err) {
                        console.error(`❌ Error en migración ${i + 1}:`, err.message);
                        reject(err);
                    } else {
                        console.log(`✅ Migración ${i + 1} completada`);
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.error(`❌ Falló migración ${i + 1}:`, error);
            process.exit(1);
        }
    }
}

runMigrations().then(() => {
    console.log('🎉 Migración completada exitosamente');
    db.close();
    process.exit(0);
}).catch(error => {
    console.error('❌ Error en migración:', error);
    db.close();
    process.exit(1);
});

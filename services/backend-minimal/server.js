// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Importar módulos nuevos
const logger = require('./logger');
const backupManager = require('./utils/backup-db');
const StripeEncryption = require('./crypto-utils');
const PaymentProcessorManager = require('./payment-processor-manager');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-production';
const STRIPE_TERMINAL_LOCATION_ID = process.env.STRIPE_TERMINAL_LOCATION_ID || process.env.TERMINAL_LOCATION_ID || null;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || null;

// Inicializar encriptación
const stripeEncryption = new StripeEncryption();

// Base de datos
const db = new sqlite3.Database('database.sqlite');

// Gestor de procesadores de pago
const paymentManager = new PaymentProcessorManager(db);

// Configuración legacy (mantenida para compatibilidad)
let stripeConfig = null;
let stripe = null;

// Cargar configuración de Stripe
function loadStripeConfig() {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM stripe_config WHERE active = 1', (err, row) => {
            if (err) {
                reject(err);
            } else if (row) {
                // Desencriptar las claves si están encriptadas
                let secretKey, publishableKey;
                
                try {
                    // Intentar desencriptar o usar valor directo si no está encriptado
                    if (typeof row.secret_key === 'string' && row.secret_key.startsWith('{')) {
                        // Parece JSON encriptado
                        const encryptedSecret = JSON.parse(row.secret_key);
                        secretKey = stripeEncryption.decrypt(encryptedSecret);
                    } else {
                        secretKey = row.secret_key;
                    }
                    
                    if (typeof row.publishable_key === 'string' && row.publishable_key.startsWith('{')) {
                        // Parece JSON encriptado
                        const encryptedPub = JSON.parse(row.publishable_key);
                        publishableKey = stripeEncryption.decrypt(encryptedPub);
                    } else {
                        publishableKey = row.publishable_key;
                    }
                } catch (decryptError) {
                    console.warn('[WARN] Error desencriptando claves, usando valores directos:', decryptError.message);
                    secretKey = row.secret_key;
                    publishableKey = row.publishable_key;
                }
                
                stripeConfig = {
                    secretKey: secretKey,
                    publishableKey: publishableKey,
                    testMode: row.test_mode === 1
                };
                
                try {
                    stripe = require('stripe')(stripeConfig.secretKey);
                    console.log('[INFO] Configuración de Stripe cargada desde la base de datos');
                    console.log(`- Secret Key: ${stripeConfig.secretKey.substring(0, 8)}...`);
                    console.log(`- Publishable Key: ${stripeConfig.publishableKey.substring(0, 8)}...`);
                    console.log(`- Test Mode: ${stripeConfig.testMode}`);
                    resolve(stripeConfig);
                } catch (error) {
                    console.error('[ERROR] Error inicializando Stripe:', error);
                    reject(error);
                }
            } else {
                console.warn('[WARN] No hay configuración de Stripe. Configúrala desde el dashboard.');
                resolve(null);
            }
        });
    });
}

// Inicializar procesadores de pago
async function initializePaymentProcessors() {
    try {
        await paymentManager.initializeProcessors();
        
        // Mantener compatibilidad con código legacy
        const stripeProcessor = paymentManager.getProcessor('stripe');
        if (stripeProcessor) {
            stripe = stripeProcessor.client;
            stripeConfig = stripeProcessor.config;
        }
        
        console.log('[INFO] Procesadores de pago inicializados');
        console.log('- Procesadores activos:', paymentManager.getActiveProcessors().join(', '));
        
    } catch (error) {
        console.error('[ERROR] Error inicializando procesadores de pago:', error);
        // Fallback a configuración legacy
        await loadStripeConfig();
    }
}

// Configurar trust proxy para funcionar detrás de nginx
app.set('trust proxy', ['127.0.0.1', '::1']);

// Middleware de seguridad
app.use(helmet({
    contentSecurityPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requests por IP por ventana
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Middleware básico
const corsOptions = {
    origin: [
        'https://be.terminal.beticket.net',
        'http://localhost:3002', // Para desarrollo local
        'http://127.0.0.1:3002'  // Para desarrollo local
    ],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Iniciar sistema de logging
logger.scheduleLogRotation();

// Middleware de logging para todas las requests
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// Iniciar backups programados
backupManager.scheduleBackups();

// Middleware de autenticación
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Función para guardar transacciones
function saveTransaction(transactionData) {
    return new Promise((resolve, reject) => {
        const {
            transaction_id,
            amount,
            currency = 'usd',
            status,
            event_code,
            card_last4,
            card_brand,
            user_id,
            payment_intent_id,
            metadata
        } = transactionData;

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO transactions 
            (transaction_id, amount, currency, status, event_code, card_last4, card_brand, user_id, payment_intent_id, metadata, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        stmt.run([
            transaction_id,
            amount,
            currency,
            status,
            event_code,
            card_last4,
            card_brand,
            user_id,
            payment_intent_id,
            JSON.stringify(metadata)
        ], function(err) {
            stmt.finalize();
            if (err) {
                logger.error('Error saving transaction', { error: err.message, transaction_id });
                reject(err);
            } else {
                logger.transaction('saved', { transaction_id, amount, status });
                resolve(this.lastID);
            }
        });
    });
}

// Dashboard routes
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalUsers = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        const totalEvents = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM events', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        const totalTransactions = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM transactions', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        const totalAmount = await new Promise((resolve, reject) => {
            db.get('SELECT SUM(amount) as total FROM transactions WHERE status = "succeeded"', (err, row) => {
                if (err) reject(err);
                else resolve(row.total || 0);
            });
        });

        const successfulTransactions = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM transactions WHERE status = "succeeded"', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        const failedTransactions = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM transactions WHERE status IN ("failed", "creation_failed")', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        const canceledTransactions = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM transactions WHERE status = "canceled"', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        const pendingTransactions = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM transactions WHERE status IN ("requires_payment_method", "requires_confirmation", "requires_action", "processing")', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        // Calculate success rate
        const successRate = totalTransactions > 0 ? ((successfulTransactions / totalTransactions) * 100).toFixed(1) : 0;

        res.json({
            totalUsers,
            totalEvents,
            totalTransactions,
            totalRevenue: (totalAmount/100).toFixed(2), // Convert from cents to dollars
            successfulTransactions,
            failedTransactions,
            canceledTransactions,
            pendingTransactions,
            successRate: `${successRate}%`
        });
    } catch (error) {
        logger.error('Dashboard stats error', { error: error.message });
        res.status(500).json({ error: 'Error loading dashboard stats' });
    }
});

app.get('/api/dashboard/transactions', async (req, res) => {
    try {
        const transactions = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.*,
                    u.username,
                    CASE 
                        WHEN t.status = 'succeeded' THEN '✅ Exitosa'
                        WHEN t.status = 'failed' THEN '❌ Fallida'
                        WHEN t.status = 'canceled' THEN '🚫 Cancelada'
                        WHEN t.status = 'requires_action' THEN '⚠️ Requiere Acción'
                        WHEN t.status = 'creation_failed' THEN '💥 Error de Creación'
                        ELSE t.status
                    END as status_display
                FROM transactions t 
                LEFT JOIN users u ON t.user_id = u.id 
                ORDER BY t.created_at DESC 
                LIMIT 100
            `, (err, rows) => {
                if (err) reject(err);
                else {
                    // Parse metadata for better display
                    const processedRows = rows.map(row => ({
                        ...row,
                        metadata: row.metadata ? JSON.parse(row.metadata) : {},
                        amount_display: (row.amount / 100).toFixed(2) // Convert cents to dollars
                    }));
                    resolve(processedRows);
                }
            });
        });

        res.json(transactions);
    } catch (error) {
        logger.error('Dashboard transactions error', { error: error.message });
        res.status(500).json({ error: 'Error loading transactions' });
    }
});

// Users endpoint
app.get('/api/dashboard/users', async (req, res) => {
    try {
        const users = await new Promise((resolve, reject) => {
            db.all('SELECT id, username, created_at FROM users ORDER BY created_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json(users);
    } catch (error) {
        logger.error('Dashboard users error', { error: error.message });
        res.status(500).json({ error: 'Error loading users' });
    }
});

// Payment processors overview (admin)
app.get('/api/payment/processors', authenticateToken, async (req, res) => {
    try {
        const active = paymentManager.getActiveProcessors();
        const items = active.map(name => {
            const proc = paymentManager.getProcessor(name);
            if (name === 'stripe') {
                const cfg = proc?.config || {};
                return {
                    name: 'stripe',
                    display_name: 'Stripe',
                    active: true,
                    test_mode: !!cfg.test_mode,
                    config: {
                        publishable_key: cfg.config?.publishable_key || null,
                        secret_key: cfg.config?.secret_key ? 'sk_****' : null
                    }
                };
            }
            return { name, display_name: name, active: true };
        });
        res.json({ processors: items });
    } catch (e) {
        logger.error('Payment processors overview error', { error: e.message });
        res.status(500).json({ error: 'Cannot list processors' });
    }
});

// Events endpoint
app.get('/api/dashboard/events', async (req, res) => {
    try {
        const events = await new Promise((resolve, reject) => {
            db.all('SELECT e.*, u.username as creator_name FROM events e LEFT JOIN users u ON e.user_id = u.id ORDER BY e.created_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json(events);
    } catch (error) {
        logger.error('Dashboard events error', { error: error.message });
        res.status(500).json({ error: 'Error loading events' });
    }
});

// Stripe configuration endpoints
app.get('/api/stripe/config', authenticateToken, async (req, res) => {
    try {
        const config = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM stripe_config WHERE active = 1', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (config) {
            // Don't send the full secret key, just show partial for security
            res.json({
                id: config.id,
                publishable_key: config.publishable_key,
                secret_key: config.secret_key ? config.secret_key.substring(0, 8) + '...' : '',
                test_mode: config.test_mode === 1,
                active: config.active === 1,
                created_at: config.created_at
            });
        } else {
            res.json(null);
        }
    } catch (error) {
        logger.error('Stripe config get error', { error: error.message });
        res.status(500).json({ error: 'Error loading Stripe configuration' });
    }
});

app.post('/api/stripe/config', authenticateToken, async (req, res) => {
    try {
        const { publishable_key, secret_key, test_mode } = req.body;

        if (!publishable_key || !secret_key) {
            return res.status(400).json({ error: 'Publishable key and secret key are required' });
        }

        // Validate Stripe keys format
        if (!publishable_key.startsWith('pk_')) {
            return res.status(400).json({ error: 'Invalid publishable key format' });
        }

        if (!secret_key.startsWith('sk_')) {
            return res.status(400).json({ error: 'Invalid secret key format' });
        }

        // Encriptar las claves antes de guardar
        let encryptedSecretKey, encryptedPublishableKey;
        try {
            encryptedSecretKey = JSON.stringify(stripeEncryption.encrypt(secret_key));
            encryptedPublishableKey = JSON.stringify(stripeEncryption.encrypt(publishable_key));
            console.log('[INFO] Claves de Stripe encriptadas exitosamente');
        } catch (encryptError) {
            console.error('[ERROR] Error encriptando claves de Stripe:', encryptError);
            return res.status(500).json({ error: 'Error encriptando claves' });
        }

        // Deactivate existing configurations
        await new Promise((resolve, reject) => {
            db.run('UPDATE stripe_config SET active = 0', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Insert new configuration with encrypted keys
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO stripe_config (publishable_key, secret_key, test_mode, active) VALUES (?, ?, ?, 1)',
                [encryptedPublishableKey, encryptedSecretKey, test_mode ? 1 : 0],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        // Reload Stripe configuration
        await loadStripeConfig();

        logger.info('Stripe configuration updated', { 
            publishableKey: publishable_key.substring(0, 8) + '...',
            testMode: test_mode 
        });

        // Adyen endpoints removed (Stripe-only)

        if (event) {
            logger.info('Event found by code', { 
                code: code,
                eventId: event.id,
                ip: req.ip 
            });

            res.json({
                success: true,
                event: event
            });
        } else {
            logger.warn('Event not found by code', { code: code, ip: req.ip });
            res.status(404).json({
                success: false,
                error: 'Event not found'
            });
        }
    } catch (error) {
        logger.error('Get event by code error', { error: error.message, code: req.params.code });
        res.status(500).json({ 
            success: false,
            error: 'Error loading event' 
        });
    }
});

// Get Stripe publishable key (public endpoint for mobile app)
app.get('/api/stripe/publishable-key', async (req, res) => {
    try {
        if (stripeConfig && stripeConfig.publishableKey) {
            res.json({
                success: true,
                publishable_key: stripeConfig.publishableKey,
                test_mode: stripeConfig.testMode
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Stripe not configured'
            });
        }
    } catch (error) {
        logger.error('Get Stripe publishable key error', { error: error.message });
        res.status(500).json({ 
            success: false,
            error: 'Error loading Stripe configuration' 
        });
    }
});

// Expose terminal location id
app.get('/api/stripe/location', async (req, res) => {
    try {
        res.json({ success: true, location_id: STRIPE_TERMINAL_LOCATION_ID || null });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Cannot load location id' });
    }
});

// Save terminal location id (admin)
app.post('/api/admin/terminal-location', authenticateToken, async (req, res) => {
    try {
        const { location_id } = req.body || {};
        if (!location_id || typeof location_id !== 'string' || !/^tml_/i.test(location_id)) {
            return res.status(400).json({ success: false, error: 'Invalid location id' });
        }
        // Update in-memory env for current process
        process.env.STRIPE_TERMINAL_LOCATION_ID = location_id;
        // Try to persist into .env in this service folder
        const fs = require('fs');
        const envPath = path.join(__dirname, '.env');
        try {
            let content = '';
            if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8');
            const lines = content.split(/\r?\n/).filter(Boolean).filter(l => !l.startsWith('STRIPE_TERMINAL_LOCATION_ID='));
            lines.push(`STRIPE_TERMINAL_LOCATION_ID=${location_id}`);
            fs.writeFileSync(envPath, lines.join('\n') + '\n');
        } catch (_) { /* best-effort persist */ }
        res.json({ success: true, location_id });
    } catch (e) {
        logger.error('Save terminal location error', { error: e.message });
        res.status(500).json({ success: false, error: 'Cannot save location id' });
    }
});

// Public events list for mobile app (simple shape)
app.get('/api/events', async (req, res) => {
    try {
        const events = await new Promise((resolve, reject) => {
            db.all('SELECT id, name, created_at FROM events ORDER BY created_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        res.json({ success: true, events });
    } catch (error) {
        logger.error('Public events list error', { error: error.message });
        // Return empty list on error to avoid blocking the app UX
        res.json({ success: true, events: [] });
    }
});

// List downloadable APK files with size & modified time
app.get('/api/admin/downloads', authenticateToken, async (req, res) => {
    try {
        const fs = require('fs');
        const crypto = require('crypto');
        const downloadsDir = path.join(__dirname, 'public', 'downloads');
        if (!fs.existsSync(downloadsDir)) {
            return res.json({ success: true, files: [] });
        }
    const entries = fs.readdirSync(downloadsDir)
            .filter(f => f.endsWith('.apk'))
            .map(f => {
                const full = path.join(downloadsDir, f);
                const stat = fs.statSync(full);
        // Parse version if filename contains pattern -vX.Y.Z- or -vX.Y.Z.apk or _vX.Y.Z
        const versionMatch = f.match(/[\-_]v(\d+\.\d+\.\d+([.-][A-Za-z0-9]+)*)/);
        const version = versionMatch ? versionMatch[1] : null;
        return { name: f, size: stat.size, mtime: stat.mtimeMs, version };
            })
            .sort((a,b) => b.mtime - a.mtime);

        // Optionally compute hashes for first N (avoid heavy cost for many files)
        const MAX_HASH = 5;
        for (let i=0;i<entries.length && i<MAX_HASH;i++) {
            const full = path.join(downloadsDir, entries[i].name);
            const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
            entries[i].sha256 = hash;
        }
    res.json({ success: true, files: entries });
    } catch (err) {
        logger.error('List downloads error', { error: err.message });
        res.status(500).json({ success: false, error: 'Cannot list downloads' });
    }
});

// Get Stripe connection token (for mobile app compatibility)
app.get('/api/stripe/connection_token', authenticateToken, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ success: false, error: 'Stripe not configured' });
        }
        const location = req.query.location || STRIPE_TERMINAL_LOCATION_ID;
        if (!location) {
            logger.warn('Connection token requested without location');
        }
        const params = location ? { location } : {};
        const token = await stripe.terminal.connectionTokens.create(params);
        logger.info('Stripe connection token created for mobile', { userId: req.user.userId, location: location || 'none' });
        res.json({ success: true, secret: token.secret, location: location || null });
    } catch (error) {
        logger.error('Connection token error', { error: error.message });
        res.status(500).json({ success: false, error: 'Error getting connection token' });
    }
});

// =============================================================================
// PROTECTED ROUTES (Below this point)
// =============================================================================

// Root route - redirect to login
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Dashboard page
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Admin dashboard page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Endpoint manual de backup
app.post('/api/admin/backup', authenticateToken, async (req, res) => {
    try {
        const backupPath = backupManager.createBackup();
        res.json({ 
            success: true, 
            message: 'Backup creado exitosamente',
            path: backupPath 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Error creando backup' 
        });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                logger.error('Database error during login', { error: err.message, username });
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user || !bcrypt.compareSync(password, user.password)) {
                logger.warn('Failed login attempt', { username });
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign(
                { userId: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            logger.info('Successful login', { username, userId: user.id });
            res.json({ success: true, token, username: user.username });
        });
    } catch (error) {
        logger.error('Login error', { error: error.message, username });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// System information endpoint
app.get('/api/system/info', async (req, res) => {
    try {
        const packageJson = require('./package.json');
        const os = require('os');
        
        // Calculate uptime
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const uptimeString = `${hours}h ${minutes}m ${seconds}s`;
        
        // Database status
        let dbStatus = 'Connected';
        try {
            db.get('SELECT 1', (err) => {
                if (err) dbStatus = 'Error';
            });
        } catch (error) {
            dbStatus = 'Error';
        }
        
        const systemInfo = {
            server: 'BeTerminal Backend',
            version: packageJson.version || '1.0.0',
            uptime: uptimeString,
            database: dbStatus,
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version,
            platform: os.platform(),
            arch: os.arch(),
            totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
            freeMemory: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
            cpus: os.cpus().length
        };
        
        res.json(systemInfo);
    } catch (error) {
        logger.error('Error getting system info', { error: error.message });
        res.status(500).json({ 
            error: 'Error getting system information',
            server: 'BeTerminal Backend',
            version: '1.0.0',
            status: 'Running'
        });
    }
});

// Test connection endpoints for payment processors

// Adyen connection test removed

// Mobile app alias for login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    try {
        db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                logger.error('Database error during login', { error: err.message, username });
                return res.status(500).json({ error: 'Database error' });
            }
            if (!user || !bcrypt.compareSync(password, user.password)) {
                logger.warn('Failed login attempt', { username });
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            const token = jwt.sign(
                { userId: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            logger.info('Successful mobile login', { username, userId: user.id });
            res.json({ success: true, token, username: user.username });
        });
    } catch (error) {
        logger.error('Mobile login error', { error: error.message, username });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint específico para Flujo Automático (Opción 2)
app.post('/api/stripe/payment_intent_auto', authenticateToken, async (req, res) => {
    const { amount, eventCode, paymentMethodId } = req.body;

    logger.info('Automatic payment flow request', {
        amount,
        eventCode,
        paymentMethodId,
        hasPaymentMethodId: !!paymentMethodId,
        user_id: req.user.userId
    });

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    try {
        // CONFIGURACIÓN PARA NFC REAL CON STRIPE TERMINAL
        const paymentIntentConfig = {
            amount: Math.round(amount),
            currency: 'usd',
            confirmation_method: 'manual',
            payment_method_types: ['card_present'], // Para NFC real
            capture_method: 'automatic',
            metadata: {
                event_code: eventCode || 'general',
                user_id: req.user.userId.toString(),
                flow_type: 'nfc_terminal'
            }
        };

        // Si tenemos paymentMethodId, agregarlo y confirmar inmediatamente
        if (paymentMethodId) {
            paymentIntentConfig.payment_method = paymentMethodId;
            paymentIntentConfig.confirm = true;
            paymentIntentConfig.payment_method_types = ['card']; // Para pagos online
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentConfig);

        // Registrar la transacción
        await saveTransaction({
            transaction_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            event_code: eventCode || 'general',
            user_id: req.user.userId,
            payment_intent_id: paymentIntent.id,
            metadata: {
                ...paymentIntent.metadata,
                flow_type: 'automatic_optimized'
            }
        });

        logger.transaction('created_auto', {
            payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount,
            status: paymentIntent.status,
            flow_type: 'automatic_optimized',
            user_id: req.user.userId
        });

        // Respuesta optimizada para flujo automático
        const isCompleted = paymentIntent.status === 'succeeded';
        const requiresAction = paymentIntent.status === 'requires_action';
        
        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            status: paymentIntent.status,
            paymentIntentId: paymentIntent.id,
            completed: isCompleted,
            requiresAction: requiresAction,
            message: isCompleted 
                ? '¡Pago completado exitosamente!'
                : requiresAction 
                    ? 'Pago requiere autenticación adicional'
                    : 'Pago procesándose automáticamente'
        });

    } catch (error) {
        // Registrar error
        const failedTransactionId = `failed_auto_${Date.now()}_${req.user.userId}`;
        
        await saveTransaction({
            transaction_id: failedTransactionId,
            amount: Math.round(amount),
            currency: 'usd',
            status: 'creation_failed',
            event_code: eventCode || 'general',
            user_id: req.user.userId,
            payment_intent_id: null,
            metadata: {
                error_message: error.message,
                error_type: error.type || 'unknown',
                error_code: error.code || 'unknown',
                flow_type: 'automatic_optimized'
            }
        });

        logger.error('Automatic payment creation error', {
            error: error.message,
            error_type: error.type,
            error_code: error.code,
            amount,
            user_id: req.user.userId
        });
        
        res.status(500).json({ 
            success: false,
            error: error.message,
            message: 'Error creando pago automático'
        });
    }
});

// Endpoint para confirmar pagos pendientes (Opción 2C)
app.post('/api/stripe/confirm_payment', authenticateToken, async (req, res) => {
    const { paymentIntentId, paymentMethodId } = req.body;

    logger.info('Payment confirmation request', {
        paymentIntentId,
        paymentMethodId,
        hasPaymentMethodId: !!paymentMethodId,
        user_id: req.user.userId
    });

    if (!paymentIntentId) {
        return res.status(400).json({ error: 'Payment Intent ID is required' });
    }

    if (!paymentMethodId) {
        return res.status(400).json({ error: 'Payment Method ID is required' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    try {
        // Confirmar el pago con el método de pago
        const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
            payment_method: paymentMethodId
        });

        // Actualizar la transacción
        await saveTransaction({
            transaction_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            event_code: paymentIntent.metadata?.event_code || 'general',
            user_id: req.user.userId,
            payment_intent_id: paymentIntent.id,
            metadata: {
                ...paymentIntent.metadata,
                confirmed_with_method: paymentMethodId,
                confirmation_timestamp: new Date().toISOString()
            }
        });

        logger.transaction('confirmed', {
            payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount,
            status: paymentIntent.status,
            user_id: req.user.userId
        });

        const isCompleted = paymentIntent.status === 'succeeded';
        const requiresAction = paymentIntent.status === 'requires_action';
        
        res.json({
            success: true,
            status: paymentIntent.status,
            paymentIntentId: paymentIntent.id,
            completed: isCompleted,
            requiresAction: requiresAction,
            clientSecret: paymentIntent.client_secret,
            message: isCompleted 
                ? '¡Pago confirmado y completado exitosamente!'
                : requiresAction 
                    ? 'Pago confirmado - Requiere autenticación adicional'
                    : 'Pago confirmado - Procesándose'
        });

    } catch (error) {
        logger.error('Payment confirmation error', {
            error: error.message,
            error_type: error.type,
            error_code: error.code,
            paymentIntentId,
            user_id: req.user.userId
        });
        
        res.status(500).json({ 
            success: false,
            error: error.message,
            message: 'Error confirmando el pago'
        });
    }
});

// Endpoint para simular tap NFC - Completar pago con tarjeta física
app.post('/api/stripe/nfc_tap', authenticateToken, async (req, res) => {
    const { paymentIntentId, cardBrand = 'visa', last4 = '4242' } = req.body;

    logger.info('NFC tap simulation request', {
        paymentIntentId,
        cardBrand,
        last4,
        user_id: req.user.userId
    });

    if (!paymentIntentId) {
        return res.status(400).json({ error: 'Payment Intent ID is required' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    try {
        // Primero, obtener el Payment Intent actual
        const currentPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (currentPaymentIntent.status !== 'requires_payment_method') {
            logger.warn('NFC tap on non-requires_payment_method intent', {
                paymentIntentId,
                current_status: currentPaymentIntent.status,
                user_id: req.user.userId
            });
            
            return res.json({
                success: true,
                status: currentPaymentIntent.status,
                message: `Payment Intent ya está en estado: ${currentPaymentIntent.status}`,
                alreadyProcessed: true
            });
        }

        // Crear un método de pago simulado para NFC
        const paymentMethod = await stripe.paymentMethods.create({
            type: 'card',
            card: {
                number: '4242424242424242', // Tarjeta de prueba
                exp_month: 12,
                exp_year: 2030,
                cvc: '123'
            },
            metadata: {
                simulated_nfc: 'true',
                brand: cardBrand,
                last4: last4,
                tap_timestamp: new Date().toISOString()
            }
        });

        logger.info('Created simulated payment method for NFC', {
            payment_method_id: paymentMethod.id,
            paymentIntentId,
            user_id: req.user.userId
        });

        // Confirmar el Payment Intent con el método de pago simulado
        const confirmedPaymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
            payment_method: paymentMethod.id
        });

        // Actualizar la transacción con información de NFC
        await saveTransaction({
            transaction_id: confirmedPaymentIntent.id,
            amount: confirmedPaymentIntent.amount,
            currency: confirmedPaymentIntent.currency,
            status: confirmedPaymentIntent.status,
            event_code: confirmedPaymentIntent.metadata?.event_code || 'general',
            user_id: req.user.userId,
            payment_intent_id: confirmedPaymentIntent.id,
            metadata: {
                ...confirmedPaymentIntent.metadata,
                nfc_simulation: 'true',
                simulated_card_brand: cardBrand,
                simulated_last4: last4,
                payment_method_id: paymentMethod.id,
                nfc_tap_timestamp: new Date().toISOString()
            }
        });

        logger.transaction('nfc_tap_completed', {
            payment_intent_id: confirmedPaymentIntent.id,
            amount: confirmedPaymentIntent.amount,
            status: confirmedPaymentIntent.status,
            payment_method_id: paymentMethod.id,
            simulated_card: `${cardBrand} ****${last4}`,
            user_id: req.user.userId
        });

        const isCompleted = confirmedPaymentIntent.status === 'succeeded';
        const requiresAction = confirmedPaymentIntent.status === 'requires_action';
        
        res.json({
            success: true,
            status: confirmedPaymentIntent.status,
            paymentIntentId: confirmedPaymentIntent.id,
            completed: isCompleted,
            requiresAction: requiresAction,
            paymentMethodId: paymentMethod.id,
            simulatedCard: {
                brand: cardBrand,
                last4: last4,
                type: 'nfc_tap'
            },
            message: isCompleted 
                ? '¡Pago NFC completado exitosamente!'
                : requiresAction 
                    ? 'Pago NFC confirmado - Requiere autenticación adicional'
                    : 'Pago NFC confirmado - Procesándose'
        });

    } catch (error) {
        logger.error('NFC tap simulation error', {
            error: error.message,
            error_type: error.type,
            error_code: error.code,
            paymentIntentId,
            user_id: req.user.userId
        });
        
        // Actualizar transacción con error
        await saveTransaction({
            transaction_id: paymentIntentId,
            amount: 0,
            currency: 'usd',
            status: 'nfc_simulation_failed',
            event_code: 'nfc_error',
            user_id: req.user.userId,
            payment_intent_id: paymentIntentId,
            metadata: {
                error_message: error.message,
                error_type: error.type || 'unknown',
                error_code: error.code || 'unknown',
                nfc_simulation_failed: 'true'
            }
        });
        
        res.status(500).json({ 
            success: false,
            error: error.message,
            message: 'Error simulando tap NFC'
        });
    }
});

// Endpoint para procesar pago NFC real con tarjeta presente
app.post('/api/stripe/process_nfc', authenticateToken, async (req, res) => {
    const { paymentIntentId, paymentMethodId } = req.body;

    logger.info('Real NFC payment processing request', {
        paymentIntentId,
        paymentMethodId,
        user_id: req.user.userId
    });

    if (!paymentIntentId) {
        return res.status(400).json({ error: 'Payment Intent ID is required' });
    }

    if (!paymentMethodId) {
        return res.status(400).json({ error: 'Payment Method ID is required' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    try {
        // Confirmar el Payment Intent con el método de pago NFC real
        const confirmedPaymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
            payment_method: paymentMethodId
        });

        // Actualizar la transacción
        await saveTransaction({
            transaction_id: confirmedPaymentIntent.id,
            amount: confirmedPaymentIntent.amount,
            currency: confirmedPaymentIntent.currency,
            status: confirmedPaymentIntent.status,
            event_code: confirmedPaymentIntent.metadata?.event_code || 'general',
            user_id: req.user.userId,
            payment_intent_id: confirmedPaymentIntent.id,
            metadata: {
                ...confirmedPaymentIntent.metadata,
                real_nfc_payment: 'true',
                payment_method_id: paymentMethodId,
                nfc_processing_timestamp: new Date().toISOString()
            }
        });

        logger.transaction('nfc_real_processed', {
            payment_intent_id: confirmedPaymentIntent.id,
            amount: confirmedPaymentIntent.amount,
            status: confirmedPaymentIntent.status,
            payment_method_id: paymentMethodId,
            user_id: req.user.userId
        });

        const isCompleted = confirmedPaymentIntent.status === 'succeeded';
        const requiresAction = confirmedPaymentIntent.status === 'requires_action';
        
        res.json({
            success: true,
            status: confirmedPaymentIntent.status,
            paymentIntentId: confirmedPaymentIntent.id,
            completed: isCompleted,
            requiresAction: requiresAction,
            paymentMethodId: paymentMethodId,
            message: isCompleted 
                ? '¡Pago NFC completado exitosamente!'
                : requiresAction 
                    ? 'Pago NFC requiere autenticación adicional'
                    : 'Pago NFC procesándose'
        });

    } catch (error) {
        logger.error('Real NFC payment processing error', {
            error: error.message,
            error_type: error.type,
            error_code: error.code,
            paymentIntentId,
            paymentMethodId,
            user_id: req.user.userId
        });
        
        await saveTransaction({
            transaction_id: paymentIntentId,
            amount: 0,
            currency: 'usd',
            status: 'nfc_processing_failed',
            event_code: 'nfc_error',
            user_id: req.user.userId,
            payment_intent_id: paymentIntentId,
            metadata: {
                error_message: error.message,
                error_type: error.type || 'unknown',
                error_code: error.code || 'unknown',
                real_nfc_processing_failed: 'true'
            }
        });
        
        res.status(500).json({ 
            success: false,
            error: error.message,
            message: 'Error procesando pago NFC real'
        });
    }
});

// Stripe webhook (raw body for signature verification)
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        if (STRIPE_WEBHOOK_SECRET && sig) {
            event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
        } else {
            // Fallback (NO signature verification) – not recommended for production
            event = JSON.parse(req.body.toString('utf8'));
        }
        logger.info('Webhook received', {
            event_type: event.type,
            event_id: event.id,
            has_signature: !!sig,
            verified: !!(STRIPE_WEBHOOK_SECRET && sig)
        });
    } catch (err) {
        logger.error('Webhook payload parsing/verification error', { error: err.message });
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const succeededIntent = event.data.object;
                await saveTransaction({
                    transaction_id: succeededIntent.id,
                    amount: succeededIntent.amount,
                    currency: succeededIntent.currency,
                    status: 'succeeded',
                    event_code: succeededIntent.metadata?.event_code,
                    card_last4: succeededIntent.charges?.data?.[0]?.payment_method_details?.card_present?.last4,
                    card_brand: succeededIntent.charges?.data?.[0]?.payment_method_details?.card_present?.brand,
                    user_id: succeededIntent.metadata?.user_id,
                    payment_intent_id: succeededIntent.id,
                    metadata: succeededIntent.metadata
                });
                break; }
            case 'payment_intent.payment_failed': {
                const failedIntent = event.data.object;
                const lastPaymentError = failedIntent.last_payment_error;
                await saveTransaction({
                    transaction_id: failedIntent.id,
                    amount: failedIntent.amount,
                    currency: failedIntent.currency,
                    status: 'failed',
                    event_code: failedIntent.metadata?.event_code,
                    user_id: failedIntent.metadata?.user_id,
                    payment_intent_id: failedIntent.id,
                    metadata: {
                        ...failedIntent.metadata,
                        failure_code: lastPaymentError?.code,
                        failure_message: lastPaymentError?.message,
                        decline_code: lastPaymentError?.decline_code
                    }
                });
                break; }
            case 'payment_intent.canceled': {
                const canceledIntent = event.data.object;
                await saveTransaction({
                    transaction_id: canceledIntent.id,
                    amount: canceledIntent.amount,
                    currency: canceledIntent.currency,
                    status: 'canceled',
                    event_code: canceledIntent.metadata?.event_code,
                    user_id: canceledIntent.metadata?.user_id,
                    payment_intent_id: canceledIntent.id,
                    metadata: canceledIntent.metadata
                });
                break; }
            case 'payment_intent.requires_action': {
                const actionIntent = event.data.object;
                await saveTransaction({
                    transaction_id: actionIntent.id,
                    amount: actionIntent.amount,
                    currency: actionIntent.currency,
                    status: 'requires_action',
                    event_code: actionIntent.metadata?.event_code,
                    user_id: actionIntent.metadata?.user_id,
                    payment_intent_id: actionIntent.id,
                    metadata: actionIntent.metadata
                });
                break; }
            default:
                logger.debug('Unhandled webhook event', { event_type: event.type });
        }
        res.json({ received: true });
    } catch (error) {
        logger.error('Webhook processing error', { error: error.message, event_type: event.type });
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// =============================================================================
// Adyen endpoints removed (Stripe-only)
// =============================================================================

// Health check
app.get('/api/health', (req, res) => {
    const activeProcessors = paymentManager.getActiveProcessors();
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        stripe_configured: !!stripe,
        payment_processors: activeProcessors,
        processors_count: activeProcessors.length
    });
});

// Inicialización
async function startServer() {
    try {
        // Inicializar procesadores de pago
        await initializePaymentProcessors();
        
        // Iniciar servidor
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[INIT] BeTerminal backend escuchando en http://0.0.0.0:${PORT}`);
            console.log(`Dashboard:   http://localhost:${PORT}/dashboard`);
            console.log(`Login:       http://localhost:${PORT}/login`);
            console.log(`Android API: http://10.0.2.2:${PORT}`);
        });

        // Conectar a la base de datos
        db.serialize(() => {
            console.log('Connected to SQLite database');
        });

    } catch (error) {
        logger.error('Server startup error', { error: error.message });
        process.exit(1);
    }
}

// Manejo de señales de cierre
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Señal SIGINT recibida. Cerrando servidor en puerto ' + PORT + '...');
    
    // Cerrar base de datos
    db.close((err) => {
        if (err) {
            console.error('Error cerrando base de datos:', err);
        }
    });
    
    console.log('[SHUTDOWN] Servidor cerrado correctamente.');
    process.exit(0);
});

// Iniciar servidor
startServer();

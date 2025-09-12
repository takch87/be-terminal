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
// const backupManager = require('./utils/backup-db');
const StripeEncryption = require('./crypto-utils');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-production';

// Inicializar encriptación
const stripeEncryption = new StripeEncryption();

// Base de datos
const db = new sqlite3.Database('database.sqlite');

// Configuración Stripe
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
                
                // Fallback a variables de entorno si falta la publishable key
                if (!publishableKey && process.env.STRIPE_PUBLISHABLE_KEY) {
                    publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
                    console.warn('[WARN] Publishable key no encontrada en DB. Usando STRIPE_PUBLISHABLE_KEY del entorno');
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
                // Intentar cargar desde entorno como último recurso
                if (process.env.STRIPE_SECRET_KEY) {
                    stripeConfig = {
                        secretKey: process.env.STRIPE_SECRET_KEY,
                        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
                        testMode: process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')
                    };
                    try {
                        stripe = require('stripe')(stripeConfig.secretKey);
                        console.log('[INFO] Stripe inicializado desde variables de entorno');
                        resolve(stripeConfig);
                        return;
                    } catch (e) {
                        console.error('[ERROR] No se pudo inicializar Stripe desde entorno:', e.message);
                    }
                }
                resolve(null);
            }
        });
    });
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

// Programar backups automáticos
// backupManager.scheduleBackups();

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
        const row = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM stripe_config WHERE active = 1', (err, r) => {
                if (err) reject(err);
                else resolve(r);
            });
        });

        if (!row) {
            return res.json({ success: false, error: 'No Stripe configuration found' });
        }

        // Decrypt values if stored encrypted as JSON
        let pub = row.publishable_key;
        let sec = row.secret_key;
        try {
            if (typeof pub === 'string' && pub.startsWith('{')) {
                pub = stripeEncryption.decrypt(JSON.parse(pub));
            }
            if (typeof sec === 'string' && sec.startsWith('{')) {
                sec = stripeEncryption.decrypt(JSON.parse(sec));
            }
        } catch (e) {
            console.warn('[WARN] Error decrypting stripe_config for GET:', e.message);
        }

        // Mask secret key safely (do not expose full secret)
        let secretMasked = '';
        if (typeof sec === 'string' && sec.length >= 8) {
            const prefix = sec.startsWith('sk_') ? sec.split('_').slice(0,2).join('_') : 'sk';
            const tail = sec.slice(-6);
            secretMasked = `${prefix}_****${tail}`;
        }

        return res.json({
            success: true,
            publishable_key: pub || '',
            secret_key: secretMasked || '',
            test_mode: row.test_mode === 1,
            active: row.active === 1,
            created_at: row.created_at || null
        });
    } catch (error) {
        logger.error('Stripe config get error', { error: error.message });
        return res.status(500).json({ success: false, error: 'Error loading Stripe configuration' });
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

        res.json({ success: true, message: 'Stripe configuration updated successfully' });
    } catch (error) {
        logger.error('Stripe config update error', { error: error.message });
        res.status(500).json({ error: 'Error updating Stripe configuration' });
    }
});

// Webhook secret configuration endpoint
app.post('/api/stripe/webhook', authenticateToken, async (req, res) => {
    try {
        const { webhook_secret } = req.body;

        // Save webhook secret to environment or config
        if (webhook_secret) {
            // In a production app, you'd save this to a secure config store
            // For now, we'll log it and confirm it's received
            logger.info('Webhook secret configured', { 
                hasSecret: !!webhook_secret,
                secretPrefix: webhook_secret ? webhook_secret.substring(0, 8) + '...' : 'none'
            });
        }

        res.json({ success: true, message: 'Webhook secret configured successfully' });
    } catch (error) {
        logger.error('Webhook config error', { error: error.message });
        res.status(500).json({ error: 'Error configuring webhook' });
    }
});

// Test webhook endpoint
app.post('/api/stripe/webhook/test', authenticateToken, async (req, res) => {
    try {
        // This endpoint helps users verify their webhook configuration
        res.json({ 
            success: true, 
            message: 'Webhook endpoint is accessible',
            endpoint: 'https://be.terminal.beticket.net/webhooks/stripe',
            events: ['payment_intent.succeeded', 'payment_intent.payment_failed']
        });
    } catch (error) {
        logger.error('Webhook test error', { error: error.message });
        res.status(500).json({ error: 'Error testing webhook' });
    }
});

// =============================================================================
// LIGHTWEIGHT MOBILE LOGGING (to diagnose app crashes)
// =============================================================================
app.post('/api/mobile/log', express.json(), (req, res) => {
    try {
        const { level = 'info', message = '', stack = '', where = '', extra = {} } = req.body || {};
        const payload = { where, message, stack, ...extra };
        if (level === 'error') logger.error('MobileLog', payload);
        else if (level === 'warn') logger.warn('MobileLog', payload);
        else logger.info('MobileLog', payload);
        res.json({ success: true });
    } catch (e) {
        logger.error('MobileLog failed', { error: e.message });
        res.status(500).json({ success: false });
    }
});

// =============================================================================
// PUBLIC API ENDPOINTS FOR MOBILE APP (No authentication required)
// =============================================================================

// Get all active events (public endpoint for mobile app)
app.get('/api/events', async (req, res) => {
    try {
        const events = await new Promise((resolve, reject) => {
            db.all('SELECT id, code, name, description, active, created_at FROM events WHERE active = 1 ORDER BY created_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        logger.info('Public events API called', { 
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            eventsCount: events.length 
        });

        res.json({
            success: true,
            events: events
        });
    } catch (error) {
        logger.error('Public events error', { error: error.message });
        res.status(500).json({ 
            success: false,
            error: 'Error loading events' 
        });
    }
});

// Get event by code (public endpoint for mobile app)
app.get('/api/events/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        const event = await new Promise((resolve, reject) => {
            db.get('SELECT id, code, name, description, active, created_at FROM events WHERE code = ? AND active = 1', [code], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

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
            // Fallback: intentar servir desde entorno aunque no esté cargado a DB
            const envPk = process.env.STRIPE_PUBLISHABLE_KEY;
            if (envPk) {
                console.warn('[WARN] publishable-key: devolviendo PK desde entorno por falta en DB');
                return res.json({ success: true, publishable_key: envPk, test_mode: envPk.startsWith('pk_test_') });
            }
            res.status(404).json({ success: false, error: 'Stripe not configured' });
        }
    } catch (error) {
        logger.error('Get Stripe publishable key error', { error: error.message });
        res.status(500).json({ 
            success: false,
            error: 'Error loading Stripe configuration' 
        });
    }
});

// Get Stripe Terminal connection token (forces configured US location)
app.get('/api/stripe/connection_token', authenticateToken, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ success: false, error: 'Stripe not configured' });
        }

        // Prefer explicit param, fallback to env, finally none
        const paramLocation = req.query.location || req.query.locationId || req.query.terminal_location_id;
        const envLocation = process.env.STRIPE_TERMINAL_LOCATION_ID;
        const location = (paramLocation && String(paramLocation).trim()) || (envLocation && String(envLocation).trim()) || undefined;

        const createArgs = location ? { location } : {};

        const token = await stripe.terminal.connectionTokens.create(createArgs);

        logger.info('Terminal connection token created', {
            userId: req.user.userId,
            hasLocation: !!location,
            location: location || null
        });

        return res.json({ success: true, secret: token.secret, location: location || null });
    } catch (error) {
        logger.error('Connection token error', { error: error.message });
        return res.status(500).json({ success: false, error: 'Error getting connection token' });
    }
});

// POST alias for connection token creation (mobile SDK default)
app.post('/api/stripe/connection_token', authenticateToken, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ success: false, error: 'Stripe not configured' });
        }

        const body = req.body || {};
        const paramLocation = body.location || body.locationId || body.terminal_location_id || req.query.location || req.query.locationId;
        const envLocation = process.env.STRIPE_TERMINAL_LOCATION_ID;
        const location = (paramLocation && String(paramLocation).trim()) || (envLocation && String(envLocation).trim()) || undefined;

        const createArgs = location ? { location } : {};
        const token = await stripe.terminal.connectionTokens.create(createArgs);

        logger.info('Terminal connection token created (POST)', {
            userId: req.user.userId,
            hasLocation: !!location,
            location: location || null
        });

        return res.json({ success: true, secret: token.secret, location: location || null });
    } catch (error) {
        logger.error('Connection token error (POST)', { error: error.message });
        return res.status(500).json({ success: false, error: 'Error getting connection token' });
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
    // Desactivar caché para asegurar que los cambios del dashboard se reflejen inmediatamente
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// No-cache para version.json
app.get('/version.json', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'version.json'));
});

// Añadir cabeceras adecuadas para descargas APK y permitir HEAD
app.head('/downloads/:file', (req, res, next) => {
    const filePath = path.join(__dirname, 'public', 'downloads', req.params.file);
    res.set('Cache-Control', 'public, max-age=60'); // breve caché para HEAD
    res.sendFile(filePath, err => {
        if (err) next();
    });
});

// Endpoint manual de backup
app.post('/api/admin/backup', authenticateToken, async (req, res) => {
    try {
        // const backupPath = backupManager.createBackup();
        res.json({ 
            success: true, 
            message: 'Backup creado exitosamente (temporalmente deshabilitado)',
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

// Mobile app alias for login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Debug logging
    logger.info('Mobile login attempt debug', { 
        username: username, 
        passwordLength: password ? password.length : 0,
        userAgent: req.get('User-Agent'),
        ip: req.ip 
    });
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                logger.error('Database error during mobile login', { error: err.message, username });
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user) {
                logger.warn('User not found during mobile login', { username });
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const passwordMatch = bcrypt.compareSync(password, user.password);
            logger.info('Password comparison debug', { 
                username, 
                passwordMatch,
                hashedPasswordFromDB: user.password.substring(0, 20) + '...' 
            });

            if (!passwordMatch) {
                logger.warn('Failed mobile login attempt - password mismatch', { username });
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

// User info (for mobile/app compatibility)
app.get('/api/auth/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        db.get('SELECT id, username, email FROM users WHERE id = ?', [userId], (err, row) => {
            if (err) {
                logger.error('User info DB error', { error: err.message, userId });
                return res.status(500).json({ error: 'Database error' });
            }
            if (!row) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json(row);
        });
    } catch (error) {
        logger.error('User info error', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Payment endpoints
app.post('/api/stripe/payment_intent', authenticateToken, async (req, res) => {
    const { amount, eventCode, paymentMethodId, flowType = 'automatic' } = req.body;

    // LOG TEMPORAL: Ver qué está enviando la app
    logger.info('Payment intent request body', {
        body: req.body,
        amount,
        eventCode,
        paymentMethodId,
        flowType,
        hasPaymentMethodId: !!paymentMethodId
    });

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    try {
        let paymentIntentConfig = {
            amount: Math.round(amount),
            currency: 'usd',
            metadata: {
                event_code: eventCode || 'general',
                user_id: req.user.userId.toString(),
                flow_type: flowType
            }
        };

        // OPCIÓN 2: FLUJO AUTOMÁTICO
        if (flowType === 'automatic') {
            if (paymentMethodId) {
                // Opción 2A: Flujo automático con paymentMethodId (confirmación inmediata)
                paymentIntentConfig = {
                    ...paymentIntentConfig,
                    payment_method: paymentMethodId,
                    confirmation_method: 'automatic',
                    confirm: true
                };
                logger.info('Using automatic flow with immediate confirmation', { paymentMethodId });
            } else {
                // Opción 2B: Flujo automático sin paymentMethodId (confirmación automática cuando se agregue método)
                paymentIntentConfig = {
                    ...paymentIntentConfig,
                    confirmation_method: 'automatic',
                    payment_method_types: ['card']
                };
                logger.info('Using automatic flow with deferred confirmation');
            }
        } else {
            // OPCIÓN 1: FLUJO MANUAL (comportamiento anterior)
            paymentIntentConfig = {
                ...paymentIntentConfig,
                payment_method: paymentMethodId,
                confirmation_method: 'manual',
                confirm: !!paymentMethodId
            };
            logger.info('Using manual flow', { paymentMethodId, willConfirm: !!paymentMethodId });
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentConfig);

        // Registrar la transacción inmediatamente al crearla
        await saveTransaction({
            transaction_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status, // 'requires_payment_method', 'requires_confirmation', etc.
            event_code: eventCode || 'general',
            user_id: req.user.userId,
            payment_intent_id: paymentIntent.id,
            metadata: paymentIntent.metadata
        });

        logger.transaction('created', {
            payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount,
            status: paymentIntent.status,
            flow_type: flowType,
            confirmation_method: paymentIntentConfig.confirmation_method,
            user_id: req.user.userId
        });

        // Respuesta mejorada con información del flujo
        const response = {
            clientSecret: paymentIntent.client_secret,
            status: paymentIntent.status,
            paymentIntentId: paymentIntent.id,
            flowType: flowType,
            confirmationMethod: paymentIntentConfig.confirmation_method
        };

        // Información adicional según el flujo
        if (flowType === 'automatic') {
            response.message = paymentMethodId 
                ? 'Pago creado y confirmado automáticamente' 
                : 'Pago creado - Se confirmará automáticamente al agregar método de pago';
            
            if (paymentIntent.status === 'succeeded') {
                response.message = '¡Pago completado exitosamente!';
                response.completed = true;
            } else if (paymentIntent.status === 'requires_action') {
                response.message = 'Pago requiere autenticación adicional';
                response.requiresAction = true;
            }
        } else {
            response.message = 'Pago creado - Requiere confirmación manual';
        }

        res.json(response);

    } catch (error) {
        // Registrar transacciones fallidas por errores de creación
        const failedTransactionId = `failed_${Date.now()}_${req.user.userId}`;
        
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
                error_code: error.code || 'unknown'
            }
        });

        logger.error('Payment intent creation error', {
            error: error.message,
            error_type: error.type,
            error_code: error.code,
            amount,
            user_id: req.user.userId
        });
        
        res.status(500).json({ error: error.message });
    }
});

// Endpoint específico para Flujo Automático (Opción 2)
// IMPORTANTE: Este endpoint está optimizado para Tap to Pay (Stripe Terminal):
// - Crea PaymentIntents con payment_method_types=['card_present'] para que el SDK pueda adjuntar
//   el PaymentMethod (card_present) sin errores de tipo.
// - Si se necesita un pago online tradicional, usar /api/stripe/payment_intent.
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
        // CONFIGURACIÓN AUTOMÁTICA OPTIMIZADA PARA NFC
        const paymentIntentConfig = {
            amount: Math.round(amount),
            currency: 'usd',
            confirmation_method: 'automatic',
            payment_method_types: ['card_present'], // Cambiado para NFC/tap
            capture_method: 'automatic',
            metadata: {
                event_code: eventCode || 'general',
                user_id: req.user.userId.toString(),
                flow_type: 'automatic_nfc'
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

// Listar últimas transacciones (para UI móvil)
app.get('/api/transactions/recent', authenticateToken, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || '20', 10), 100)
        db.all(
            `SELECT id, transaction_id, amount, currency, status, event_code, user_id, payment_intent_id, created_at
             FROM transactions
             ORDER BY created_at DESC
             LIMIT ?`,
            [limit],
            (err, rows) => {
                if (err) {
                    logger.error('Recent transactions DB error', { error: err.message })
                    return res.status(500).json({ error: 'Database error' })
                }
                res.json({ success: true, items: rows })
            }
        )
    } catch (e) {
        res.status(500).json({ error: 'Internal error' })
    }
})

// Anular/Refund: crea un reembolso en Stripe por PaymentIntent (monto opcional)
app.post('/api/stripe/refund', authenticateToken, async (req, res) => {
    const { payment_intent_id, amount } = req.body || {}
    if (!payment_intent_id) return res.status(400).json({ error: 'payment_intent_id required' })
    try {
        const params = { payment_intent: payment_intent_id }
        if (amount && amount > 0) params.amount = Math.round(amount)
        const refund = await stripe.refunds.create(params)

        // Guardar registro de estado en DB
        await saveTransaction({
            transaction_id: refund.id,
            amount: refund.amount,
            currency: refund.currency,
            status: refund.status || 'refunded',
            event_code: 'refund',
            user_id: req.user.userId,
            payment_intent_id: payment_intent_id,
            metadata: { reason: 'mobile_refund' }
        })

        res.json({ success: true, refund })
    } catch (error) {
        logger.error('Refund error', { error: error.message, payment_intent_id })
        res.status(500).json({ error: error.message })
    }
})

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

        // Asegurar metadatos seguros
        const piMeta = paymentIntent && paymentIntent.metadata ? paymentIntent.metadata : {};

        // Actualizar la transacción
        await saveTransaction({
            transaction_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            event_code: (piMeta && piMeta.event_code) ? piMeta.event_code : 'general',
            user_id: req.user.userId,
            payment_intent_id: paymentIntent.id,
            metadata: Object.assign({}, piMeta, {
                confirmed_with_method: paymentMethodId,
                confirmation_timestamp: new Date().toISOString()
            })
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

// Stripe webhook
app.post('/webhooks/stripe', express.json(), async (req, res) => {
    const payload = req.body;
    const sig = req.headers['stripe-signature'];

    let event;
    try {
        // The event is already parsed by express.json()
        event = payload;
        
        logger.info('Webhook received', { 
            event_type: event.type,
            event_id: event.id,
            has_signature: !!sig
        });
        
    } catch (err) {
        logger.error('Webhook payload parsing error', { error: err.message, payload_type: typeof payload });
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                const succeededIntent = event.data.object;
                logger.info('Payment succeeded', { payment_intent_id: succeededIntent.id });
                
                await saveTransaction({
                    transaction_id: succeededIntent.id,
                    amount: succeededIntent.amount,
                    currency: succeededIntent.currency,
                    status: 'succeeded',
                    event_code: succeededIntent.metadata && succeededIntent.metadata.event_code,
                    card_last4: (succeededIntent.payment_method && succeededIntent.payment_method.card) ? succeededIntent.payment_method.card.last4 : undefined,
                    card_brand: (succeededIntent.payment_method && succeededIntent.payment_method.card) ? succeededIntent.payment_method.card.brand : undefined,
                    user_id: succeededIntent.metadata && succeededIntent.metadata.user_id,
                    payment_intent_id: succeededIntent.id,
                    metadata: succeededIntent.metadata
                });
                break;

            case 'payment_intent.payment_failed':
                const failedIntent = event.data.object;
                const lastPaymentError = failedIntent.last_payment_error;
                logger.warn('Payment failed', { 
                    payment_intent_id: failedIntent.id,
                    failure_code: lastPaymentError && lastPaymentError.code,
                    failure_message: lastPaymentError && lastPaymentError.message
                });
                
                await saveTransaction({
                    transaction_id: failedIntent.id,
                    amount: failedIntent.amount,
                    currency: failedIntent.currency,
                    status: 'failed',
                    event_code: failedIntent.metadata && failedIntent.metadata.event_code,
                    card_last4: (lastPaymentError && lastPaymentError.payment_method && lastPaymentError.payment_method.card) ? lastPaymentError.payment_method.card.last4 : undefined,
                    card_brand: (lastPaymentError && lastPaymentError.payment_method && lastPaymentError.payment_method.card) ? lastPaymentError.payment_method.card.brand : undefined,
                    user_id: failedIntent.metadata && failedIntent.metadata.user_id,
                    payment_intent_id: failedIntent.id,
                    metadata: {
                        ...(failedIntent.metadata || {}),
                        failure_code: lastPaymentError && lastPaymentError.code,
                        failure_message: lastPaymentError && lastPaymentError.message,
                        decline_code: lastPaymentError && lastPaymentError.decline_code
                    }
                });
                break;

            case 'payment_intent.canceled':
                const canceledIntent = event.data.object;
                logger.info('Payment canceled', { payment_intent_id: canceledIntent.id });
                
                await saveTransaction({
                    transaction_id: canceledIntent.id,
                    amount: canceledIntent.amount,
                    currency: canceledIntent.currency,
                    status: 'canceled',
                    event_code: canceledIntent.metadata && canceledIntent.metadata.event_code,
                    user_id: canceledIntent.metadata && canceledIntent.metadata.user_id,
                    payment_intent_id: canceledIntent.id,
                    metadata: canceledIntent.metadata
                });
                break;

            case 'payment_intent.requires_action':
                const actionIntent = event.data.object;
                logger.info('Payment requires action', { payment_intent_id: actionIntent.id });
                
                await saveTransaction({
                    transaction_id: actionIntent.id,
                    amount: actionIntent.amount,
                    currency: actionIntent.currency,
                    status: 'requires_action',
                    event_code: actionIntent.metadata && actionIntent.metadata.event_code,
                    user_id: actionIntent.metadata && actionIntent.metadata.user_id,
                    payment_intent_id: actionIntent.id,
                    metadata: actionIntent.metadata
                });
                break;

            default:
                logger.debug('Unhandled webhook event', { event_type: event.type });
        }

        res.json({ received: true });
    } catch (error) {
        logger.error('Webhook processing error', { error: error.message, event_type: event.type });
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        stripe_configured: !!stripe 
    });
});

// Inicialización
async function startServer() {
    try {
        // Cargar configuración de Stripe
        await loadStripeConfig();
        
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

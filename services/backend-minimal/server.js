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
            db.get('SELECT COUNT(*) as count FROM transactions WHERE status = "failed"', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        res.json({
            totalUsers,
            totalEvents,
            totalTransactions,
            totalRevenue: (totalAmount/100).toFixed(2), // Convert from cents to dollars
            successfulTransactions,
            failedTransactions
        });
    } catch (error) {
        logger.error('Dashboard stats error', { error: error.message });
        res.status(500).json({ error: 'Error loading dashboard stats' });
    }
});

app.get('/api/dashboard/transactions', async (req, res) => {
    try {
        const transactions = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
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

// Get Stripe connection token (for mobile app compatibility)
app.get('/api/stripe/connection_token', authenticateToken, async (req, res) => {
    try {
        // This endpoint is for mobile app compatibility
        // Since we're using phone NFC instead of external readers,
        // we just return a success response
        logger.info('Connection token requested for mobile NFC', { 
            userId: req.user.userId,
            username: req.user.username 
        });
        
        res.json({
            success: true,
            message: 'Mobile NFC ready',
            connection_type: 'mobile_nfc',
            status: 'connected'
        });
    } catch (error) {
        logger.error('Connection token error', { error: error.message });
        res.status(500).json({ 
            success: false,
            error: 'Error getting connection token' 
        });
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

// Payment endpoints
app.post('/api/stripe/payment_intent', authenticateToken, async (req, res) => {
    const { amount, eventCode, paymentMethodId } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount),
            currency: 'usd',
            metadata: {
                event_code: eventCode || 'general',
                user_id: req.user.userId.toString()
            },
            payment_method: paymentMethodId,
            confirmation_method: 'manual',
            confirm: !!paymentMethodId
        });

        logger.transaction('created', {
            payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount,
            user_id: req.user.userId
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            status: paymentIntent.status
        });

    } catch (error) {
        logger.error('Payment intent creation error', {
            error: error.message,
            amount,
            user_id: req.user.userId
        });
        res.status(500).json({ error: error.message });
    }
});

// Stripe webhook
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const payload = req.body;
    const sig = req.headers['stripe-signature'];

    let event;
    try {
        // Try to verify webhook signature if we have the secret
        // For now, we'll use simple JSON parsing, but signature verification is recommended
        event = JSON.parse(payload);
        
        logger.info('Webhook received', { 
            event_type: event.type,
            event_id: event.id,
            has_signature: !!sig
        });
        
    } catch (err) {
        logger.error('Webhook payload parsing error', { error: err.message });
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
                    event_code: succeededIntent.metadata?.event_code,
                    card_last4: succeededIntent.payment_method?.card?.last4,
                    card_brand: succeededIntent.payment_method?.card?.brand,
                    payment_intent_id: succeededIntent.id,
                    metadata: succeededIntent.metadata
                });
                break;

            case 'payment_intent.payment_failed':
                const failedIntent = event.data.object;
                logger.warn('Payment failed', { payment_intent_id: failedIntent.id });
                
                await saveTransaction({
                    transaction_id: failedIntent.id,
                    amount: failedIntent.amount,
                    currency: failedIntent.currency,
                    status: 'failed',
                    event_code: failedIntent.metadata?.event_code,
                    card_last4: failedIntent.payment_method?.card?.last4,
                    card_brand: failedIntent.payment_method?.card?.brand,
                    payment_intent_id: failedIntent.id,
                    metadata: failedIntent.metadata
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

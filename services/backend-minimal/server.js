/*
  BeTerminal backend completo para Stripe Terminal (Tap to Pay en Android)
  Funcionalidades:
  - Autenticación de usuarios
  - Gestión de eventos con códigos
  - APIs de Stripe Terminal
  - Dashboard web con login
*/
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
require('dotenv').config();

const Database = require('./database');

const app = express();
// FORZAMOS puerto fijo 3002 siempre (ignoramos process.env.PORT para evitar desalineaciones)
const FORCED_PORT = 3002;
if (process.env.PORT && process.env.PORT !== '3002') {
  console.warn(`[WARN] Variable de entorno PORT='${process.env.PORT}' ignorada. Usando puerto fijo 3002.`);
}
const PORT = FORCED_PORT;
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || '*').split(',');
let STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret-change-in-production';

const db = new Database(process.env.DB_PATH);

// Variables globales para Stripe que se pueden actualizar
let stripe = null;
let currentStripeConfig = {
  secretKey: null,
  publishableKey: null,
  testMode: true
};

// Función para cargar configuración de Stripe desde la base de datos
async function loadStripeConfig() {
  try {
    const secretKey = await db.getConfig('stripe_secret_key');
    const publishableKey = await db.getConfig('stripe_publishable_key');
    const testMode = await db.getConfig('stripe_test_mode');

    if (secretKey) {
      STRIPE_SECRET_KEY = secretKey;
      currentStripeConfig.secretKey = secretKey;
      currentStripeConfig.publishableKey = publishableKey || '';
      currentStripeConfig.testMode = testMode !== 'false';
      
      stripe = require('stripe')(secretKey);
      console.log('[INFO] Configuración de Stripe cargada desde la base de datos');
      console.log('- Secret Key:', secretKey.substring(0, 12) + '...');
      console.log('- Publishable Key:', publishableKey ? publishableKey.substring(0, 12) + '...' : 'No configurada');
      console.log('- Test Mode:', currentStripeConfig.testMode);
    } else if (!STRIPE_SECRET_KEY) {
      console.warn('[WARN] No hay configuración de Stripe. Configúrala desde el dashboard.');
    } else {
      stripe = require('stripe')(STRIPE_SECRET_KEY);
      currentStripeConfig.secretKey = STRIPE_SECRET_KEY;
      console.log('[INFO] Usando STRIPE_SECRET_KEY del archivo .env');
    }
  } catch (error) {
    console.error('[ERROR] Error cargando configuración de Stripe:', error);
    if (STRIPE_SECRET_KEY) {
      stripe = require('stripe')(STRIPE_SECRET_KEY);
      currentStripeConfig.secretKey = STRIPE_SECRET_KEY;
      console.log('[INFO] Fallback: usando STRIPE_SECRET_KEY del archivo .env');
    }
  }
}

// Cargar configuración al iniciar
loadStripeConfig();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Permite inline scripts para el dashboard
}));
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: false }));
app.use(morgan('tiny'));
app.use(express.static(path.join(__dirname, 'public')));

// Diagnóstico de señales para asegurar liberación de puerto
['SIGINT','SIGTERM','SIGQUIT'].forEach(sig => {
  process.on(sig, () => {
    console.log(`[SHUTDOWN] Señal ${sig} recibida. Cerrando servidor en puerto ${PORT}...`);
    try {
      server && server.close(() => {
        console.log('[SHUTDOWN] Servidor cerrado correctamente.');
        process.exit(0);
      });
      // Failsafe: forzar salida si no cierra en 5s
      setTimeout(() => {
        console.warn('[SHUTDOWN] Forzando salida tras timeout.');
        process.exit(1);
      }, 5000).unref();
    } catch (e) {
      console.error('[SHUTDOWN] Error cerrando servidor:', e);
      process.exit(1);
    }
  });
});

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// Rutas públicas
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get('/api/status', (_req, res) => {
  // Lee la versión dinámica desde public/version.json si existe
  let version = 'unknown';
  try {
    const verPath = path.join(__dirname, 'public', 'version.json');
    if (fs.existsSync(verPath)) {
      const data = JSON.parse(fs.readFileSync(verPath, 'utf8'));
      if (data && data.android && data.android.versionName) {
        version = data.android.versionName;
      }
    }
  } catch (e) {
    console.warn('[WARN] No se pudo leer version.json:', e.message);
  }
  res.json({ status: 'ok', server: 'BeTerminal', version, ts: Date.now() });
});

// Endpoint explícito para datos de versión de la app
app.get('/api/app/version', (_req, res) => {
  try {
    const verPath = path.join(__dirname, 'public', 'version.json');
    const data = JSON.parse(fs.readFileSync(verPath, 'utf8'));
    return res.json(data.android || data);
  } catch (e) {
    return res.status(500).json({ error: 'No version data', detail: e.message });
  }
});

app.get('/api/stripe/status', (_req, res) => {
  const stripeConfigured = !!stripe && STRIPE_SECRET_KEY !== 'sk_test_your_stripe_secret_key_here';
  res.json({ 
    stripe_configured: stripeConfigured,
    stripe_demo_mode: !stripeConfigured,
    server: 'BeTerminal', 
    ts: Date.now() 
  });
});

// API de autenticación
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// API para obtener información del usuario autenticado
app.get('/api/auth/user', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email || null
    });
  } catch (err) {
    console.error('Get user info error:', err);
    res.status(500).json({ error: 'Error al obtener información del usuario' });
  }
});

// API de usuarios (protegida)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    console.log('GET /api/users called by user:', req.user.username);
    const users = await db.getAllUsers();
    console.log('Users found:', users.length);
    res.json(users);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    const newUser = await db.createUser(username, password);
    res.json({ message: 'Usuario creado exitosamente', user: newUser });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }

    const result = await db.deleteUser(userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// API de eventos (protegida)
app.post('/api/events', authenticateToken, async (req, res) => {
  try {
    const { code, name, description } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Código y nombre del evento requeridos' });
    }

    const existingEvent = await db.getEventByCode(code);
    if (existingEvent) {
      return res.status(400).json({ error: 'Ya existe un evento con ese código' });
    }

    const newEvent = await db.createEvent(code, name, description, req.user.id);
    res.json({ message: 'Evento creado exitosamente', event: newEvent });
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Error al crear evento' });
  }
});

app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    console.log('GET /api/events called by user:', req.user.username);
    const events = await db.getAllEvents();
    console.log('Events found:', events.length);
    res.json(events);
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

app.get('/api/events/:code', authenticateToken, async (req, res) => {
  try {
    const eventCode = req.params.code;
    const userId = req.user.id;

    // Buscar el evento por código
    const event = await db.getEventByCode(eventCode);
    if (!event) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    // Verificar que el usuario tiene acceso al evento
    const hasAccess = await db.hasUserEventPermission(userId, event.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No tienes acceso a este evento' });
    }

    res.json(event);
  } catch (err) {
    console.error('Validate event error:', err);
    res.status(500).json({ error: 'Error al validar evento' });
  }
});

app.put('/api/events/:id', authenticateToken, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { name, description, active } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nombre del evento requerido' });
    }

    const result = await db.updateEvent(eventId, { name, description, active });
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json({ message: 'Evento actualizado exitosamente' });
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
});

app.delete('/api/events/:id', authenticateToken, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    
    const result = await db.deleteEvent(eventId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json({ message: 'Evento eliminado exitosamente' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

// APIs para gestión de relaciones usuario-evento
app.post('/api/user-events/link', authenticateToken, async (req, res) => {
  try {
    const { userId, eventId, role = 'operator' } = req.body;

    if (!userId || !eventId) {
      return res.status(400).json({ error: 'userId y eventId requeridos' });
    }

    const link = await db.linkUserToEvent(userId, eventId, role);
    res.json({ message: 'Usuario vinculado al evento exitosamente', link });
  } catch (err) {
    console.error('Link user to event error:', err);
    res.status(500).json({ error: 'Error al vincular usuario al evento' });
  }
});

app.delete('/api/user-events/unlink', authenticateToken, async (req, res) => {
  try {
    const { userId, eventId } = req.body;

    if (!userId || !eventId) {
      return res.status(400).json({ error: 'userId y eventId requeridos' });
    }

    const result = await db.unlinkUserFromEvent(userId, eventId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Vinculación no encontrada' });
    }

    res.json({ message: 'Usuario desvinculado del evento exitosamente' });
  } catch (err) {
    console.error('Unlink user from event error:', err);
    res.status(500).json({ error: 'Error al desvincular usuario del evento' });
  }
});

app.get('/api/users/:id/events', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const userEvents = await db.getUserEventLinks(userId);
    res.json(userEvents);
  } catch (err) {
    console.error('Get user events error:', err);
    res.status(500).json({ error: 'Error al obtener eventos del usuario' });
  }
});

app.get('/api/events/:id/users', authenticateToken, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const eventUsers = await db.getEventUserLinks(eventId);
    res.json(eventUsers);
  } catch (err) {
    console.error('Get event users error:', err);
    res.status(500).json({ error: 'Error al obtener usuarios del evento' });
  }
});

// Validar evento por código (para el terminal)
app.post('/api/events/validate', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Código de evento requerido' });
    }

    const event = await db.getEventByCode(code);
    if (!event) {
      return res.status(404).json({ error: 'Evento no encontrado o inactivo' });
    }

    res.json({ 
      valid: true, 
      event: { id: event.id, code: event.code, name: event.name } 
    });
  } catch (err) {
    console.error('Validate event error:', err);
    res.status(500).json({ error: 'Error al validar evento' });
  }
});

// Stripe Terminal endpoints
app.post('/connection_token', async (req, res) => {
  if (!stripe) {
    // Modo demo sin Stripe - devolver token falso para testing
    console.log('[DEMO] Devolviendo connection_token falso para testing');
    return res.json({ 
      secret: 'demo_connection_token_for_testing_' + Date.now(),
      demo: true 
    });
  }
  
  try {
    const token = await stripe.terminal.connectionTokens.create();
    res.json({ secret: token.secret });
  } catch (err) {
    console.error('connection_token error', err);
    res.status(500).json({ error: 'No se pudo crear connection_token' });
  }
});

// Endpoint para la app Android (misma funcionalidad, diferente ruta)
app.post('/api/stripe/connection_token', authenticateToken, async (req, res) => {
  if (!stripe) {
    // Modo demo sin Stripe - devolver token falso para testing
    console.log('[DEMO] Android app - Devolviendo connection_token falso para testing');
    return res.json({ 
      secret: 'demo_connection_token_android_' + Date.now(),
      demo: true 
    });
  }
  
  try {
    const token = await stripe.terminal.connectionTokens.create();
    console.log('[INFO] Connection token creado exitosamente para Android app');
    res.json({ secret: token.secret });
  } catch (err) {
    console.error('Android connection_token error', err);
    res.status(500).json({ error: 'No se pudo crear connection_token para Android' });
  }
});

app.post('/create_payment_intent', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Backend sin STRIPE_SECRET_KEY' });
  
  try {
    const {
      amount_cents,
      currency = 'mxn',
      description,
      event_code
    } = req.body || {};

    const amount = Number(amount_cents);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount_cents inválido' });
    }

    // Validar evento si se proporciona código
    if (event_code) {
      const event = await db.getEventByCode(event_code);
      if (!event) {
        return res.status(400).json({ error: 'Código de evento inválido' });
      }
    }

    const pi = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      description: description || undefined,
      metadata: event_code ? { event_code } : undefined
    });

    res.json({ 
      id: pi.id, 
      client_secret: pi.client_secret, 
      status: pi.status 
    });
  } catch (err) {
    console.error('create_payment_intent error', err);
    res.status(500).json({ error: 'No se pudo crear PaymentIntent' });
  }
});

// Endpoint para la app Android (misma funcionalidad, diferente ruta y formato)
app.post('/api/stripe/payment-intent', authenticateToken, async (req, res) => {
  if (!stripe) {
    // Modo demo sin Stripe
    console.log('[DEMO] Android app - Devolviendo payment intent falso para testing');
    return res.json({ 
      id: 'pi_demo_android_' + Date.now(),
      client_secret: 'pi_demo_android_secret_' + Date.now(),
      status: 'requires_payment_method',
      demo: true 
    });
  }
  
  try {
    const { amount, eventCode, paymentMethodId } = req.body || {};

    // Log básico de la solicitud (sin exponer tokens)
    console.log('[REQ] /api/stripe/payment-intent', { amount, eventCode, hasPaymentMethod: !!paymentMethodId, user: req.user && req.user.username });

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount inválido' });
    }

    // Validar evento si se proporciona código
    if (eventCode) {
      const event = await db.getEventByCode(eventCode);
      if (!event) {
        return res.status(400).json({ error: 'Código de evento inválido' });
      }
    }

    let pi;
    let usedFallback = false;
    
    // Configuración base del PaymentIntent
    const piConfig = {
      amount: Math.round(amount),
      currency: 'usd', // USD para compatibilidad
      capture_method: 'automatic',
      description: `Pago evento ${eventCode || 'N/A'}`,
      metadata: eventCode ? { event_code: eventCode } : undefined
    };
    
    // Si tenemos payment_method_id (NFC tokenized), usamos 'card' en lugar de 'card_present'
    if (paymentMethodId) {
      console.log('[INFO] Creando PaymentIntent con payment_method tokenizado desde NFC');
      piConfig.payment_method = paymentMethodId;
      piConfig.payment_method_types = ['card'];
      piConfig.confirmation_method = 'automatic';
      piConfig.confirm = true; // Confirmar automáticamente
    } else {
      // Flujo legacy sin payment method (simulado)
      piConfig.payment_method_types = ['card_present'];
    }

    try {
      pi = await stripe.paymentIntents.create(piConfig);
    } catch (err) {
      // Si la cuenta no soporta card_present aún, intentamos fallback a 'card' (solo para pruebas)
      const msg = (err && err.message) || '';
      if (msg.includes('card_present') || (err && err.code === 'parameter_invalid_empty')) {
        console.warn('[WARN] card_present no soportado. Intentando fallback a payment_method_types=["card"]. Mensaje:', msg);
        try {
          pi = await stripe.paymentIntents.create({
            amount: Math.round(amount),
            currency: 'usd', // USD para compatibilidad
            payment_method_types: ['card'],
            capture_method: 'automatic',
            description: `Pago (fallback) evento ${eventCode || 'N/A'}`,
            metadata: { ...(eventCode ? { event_code: eventCode } : {}), fallback_from: 'card_present' }
          });
          usedFallback = true;
        } catch (innerErr) {
          console.error('[ERROR] Fallback a payment_method_types=["card"] también falló', {
            message: innerErr.message,
            type: innerErr.type,
            code: innerErr.code,
            raw: innerErr.raw
          });
          throw innerErr; // Propagamos para manejo general
        }
      } else {
        // Error distinto, lo propagamos
        throw err;
      }
    }

    console.log('[INFO] Payment intent creado exitosamente para Android app:', {
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
      currency: pi.currency,
      fallback: usedFallback
    });
    res.json({ 
      id: pi.id,
      client_secret: pi.client_secret, 
      status: pi.status,
      fallback: usedFallback || undefined
    });
  } catch (err) {
    // Log detallado del error
    console.error('Android payment_intent error', {
      message: err.message,
      type: err.type,
      code: err.code,
      decline_code: err.decline_code,
      raw_type: err.raw && err.raw.type,
      raw_code: err.raw && err.raw.code,
      stack: err.stack
    });
    const debugEnabled = process.env.STRIPE_DEBUG === '1' || req.headers['x-debug-stripe'] === '1';
    const base = { error: 'No se pudo crear PaymentIntent para Android', code: err.code || undefined };
    if (debugEnabled) {
      base.debug = {
        message: err.message,
        type: err.type,
        decline_code: err.decline_code,
        raw: err.raw || null
      };
    }
    res.status(500).json(base);
  }
});

// Endpoint de prueba para aislar problemas con card_present: crea un PaymentIntent estándar (card)
app.post('/api/stripe/test-intent', authenticateToken, async (req, res) => {
  if (!stripe) {
    return res.status(400).json({ error: 'Stripe no configurado' });
  }
  try {
    const { amount } = req.body || {};
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount inválido' });
    }
    console.log('[REQ] /api/stripe/test-intent', { amount, user: req.user && req.user.username });
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: 'mxn',
      payment_method_types: ['card'],
      description: 'Test PaymentIntent (sin card_present)'
    });
    res.json({ id: pi.id, client_secret: pi.client_secret, status: pi.status });
  } catch (err) {
    console.error('[ERROR] test-intent', { message: err.message, code: err.code, type: err.type, stack: err.stack });
    const debugEnabled = process.env.STRIPE_DEBUG === '1' || req.headers['x-debug-stripe'] === '1';
    const base = { error: 'Fallo creando test PaymentIntent', code: err.code || undefined };
    if (debugEnabled) {
      base.debug = { message: err.message, type: err.type, raw: err.raw || null };
    }
    res.status(500).json(base);
  }
});

// Endpoint específico para PaymentIntent con payment_method_id (flujo NFC real)
app.post('/api/stripe/payment-intent-with-method', authenticateToken, async (req, res) => {
  if (!stripe) {
    return res.status(400).json({ error: 'Stripe no configurado' });
  }
  
  try {
    const { amount, eventCode, paymentMethodId } = req.body || {};
    
    console.log('[REQ] /api/stripe/payment-intent-with-method', { amount, eventCode, paymentMethodId: paymentMethodId?.substring(0, 8) + '...' });

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount inválido' });
    }
    
    if (!paymentMethodId) {
      return res.status(400).json({ error: 'paymentMethodId requerido' });
    }

    // Validar evento si se proporciona código
    if (eventCode) {
      const event = await db.getEventByCode(eventCode);
      if (!event) {
        return res.status(400).json({ error: 'Código de evento inválido' });
      }
    }

    // Crear PaymentIntent con el payment_method ya tokenizado
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: 'usd', // Costa Rica - USD comúnmente aceptado
      payment_method: paymentMethodId,
      confirmation_method: 'automatic',
      confirm: true, // Confirmar inmediatamente
      description: `Pago NFC evento ${eventCode || 'N/A'}`,
      metadata: eventCode ? { event_code: eventCode, method: 'nfc_real' } : { method: 'nfc_real' }
    });

    console.log('[INFO] PaymentIntent con NFC creado:', {
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
      currency: pi.currency
    });

    res.json({ 
      id: pi.id,
      client_secret: pi.client_secret, 
      status: pi.status
    });
  } catch (err) {
    console.error('payment-intent-with-method error', {
      message: err.message,
      type: err.type,
      code: err.code,
      decline_code: err.decline_code,
      stack: err.stack
    });
    res.status(500).json({ 
      error: 'No se pudo procesar el pago', 
      code: err.code || undefined,
      decline_code: err.decline_code || undefined
    });
  }
});

// Endpoint para obtener configuración de Stripe (publishable key)
app.get('/api/config/stripe', authenticateToken, async (req, res) => {
  try {
    const publishableKey = await db.getConfig('stripe_publishable_key');
    const testMode = await db.getConfig('stripe_test_mode');
    
    res.json({
      publishableKey: publishableKey || '',
      testMode: testMode !== 'false'
    });
  } catch (err) {
    console.error('Error obteniendo config Stripe:', err);
    res.status(500).json({ error: 'Error de configuración' });
  }
});

// Webhook de Stripe (opcional, para recibir eventos)
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('No webhook secret configured');
    return res.status(400).send('Webhook secret not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar el evento
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('PaymentIntent succeeded:', event.data.object.id);
      break;
    case 'payment_intent.payment_failed':
      console.log('PaymentIntent failed:', event.data.object.id);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// APIs de configuración
app.get('/api/config/stripe', authenticateToken, (req, res) => {
  try {
    const config = {
      configured: !!currentStripeConfig.secretKey,
      publishableKey: currentStripeConfig.publishableKey || '',
      testMode: currentStripeConfig.testMode,
      webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET
    };
    res.json(config);
  } catch (error) {
    console.error('Error getting Stripe config:', error);
    res.status(500).json({ error: 'Error obteniendo configuración' });
  }
});

app.post('/api/config/stripe', authenticateToken, async (req, res) => {
  try {
    const { secretKey, publishableKey, webhookSecret, testMode } = req.body;

    if (!secretKey || !publishableKey) {
      return res.status(400).json({ error: 'Secret key y publishable key son requeridos' });
    }

    // Validar que las claves tengan el formato correcto
    if (!secretKey.startsWith('sk_')) {
      return res.status(400).json({ error: 'Secret key debe comenzar con sk_' });
    }
    
    if (!publishableKey.startsWith('pk_')) {
      return res.status(400).json({ error: 'Publishable key debe comenzar con pk_' });
    }

    // Verificar que las claves funcionen
    try {
      const testStripe = require('stripe')(secretKey);
      await testStripe.accounts.retrieve();
    } catch (stripeError) {
      return res.status(400).json({ error: 'Las claves de Stripe no son válidas: ' + stripeError.message });
    }

    // En producción, estas claves deberían guardarse en una base de datos o archivo de configuración seguro
    // Por ahora las guardamos en variables de entorno (requiere reinicio)
    console.log('Nueva configuración de Stripe recibida:');
    console.log('- Secret Key:', secretKey.substring(0, 12) + '...');
    console.log('- Publishable Key:', publishableKey.substring(0, 12) + '...');
    console.log('- Test Mode:', testMode);
    console.log('- Webhook Secret:', webhookSecret ? 'Configurado' : 'No configurado');
    
    // Guardar en base de datos para persistencia
    await db.saveConfig('stripe_secret_key', secretKey);
    await db.saveConfig('stripe_publishable_key', publishableKey);
    await db.saveConfig('stripe_test_mode', testMode.toString());
    if (webhookSecret) {
      await db.saveConfig('stripe_webhook_secret', webhookSecret);
    }

    // Recargar configuración inmediatamente
    await loadStripeConfig();

    res.json({ 
      success: true, 
      message: 'Configuración guardada y aplicada exitosamente.' 
    });
  } catch (error) {
    console.error('Error saving Stripe config:', error);
    res.status(500).json({ error: 'Error guardando configuración' });
  }
});

app.post('/api/config/location', authenticateToken, async (req, res) => {
  try {
    const { displayName, address } = req.body;

    if (!displayName) {
      return res.status(400).json({ error: 'Nombre de ubicación es requerido' });
    }

    await db.saveConfig('location_display_name', displayName);
    await db.saveConfig('location_address', address || '');

    res.json({ success: true, message: 'Configuración de ubicación guardada' });
  } catch (error) {
    console.error('Error saving location config:', error);
    res.status(500).json({ error: 'Error guardando configuración de ubicación' });
  }
});

app.get('/api/stripe/status', authenticateToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.json({ 
        connected: false, 
        error: 'Stripe no está configurado',
        mode: null
      });
    }

    // Intentar hacer una llamada a la API de Stripe para verificar conectividad
    const account = await stripe.accounts.retrieve();
    
    res.json({
      connected: true,
      mode: account.details_submitted ? 'Producción' : 'Prueba',
      accountId: account.id,
      country: account.country,
      currency: account.default_currency
    });
  } catch (error) {
    console.error('Error checking Stripe status:', error);
    res.json({
      connected: false,
      error: error.message,
      mode: null
    });
  }
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Manejo de señales para cerrar el servidor correctamente
// Temporalmente comentados para debug
/*
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado correctamente');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT recibido, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado correctamente');
    process.exit(0);
  });
});
*/

// Inicializar servidor con puerto fijo 3001
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[INIT] BeTerminal backend escuchando en http://0.0.0.0:${PORT}`);
  console.log(`Dashboard:   http://localhost:${PORT}/dashboard`);
  console.log(`Login:       http://localhost:${PORT}/login`);
  console.log(`Android API: http://10.0.2.2:${PORT}`);
});
server.on('error', (err) => {
  console.error('[ERROR] Falló al iniciar el servidor:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] El puerto ${PORT} está en uso. Ejecuta: lsof -i:${PORT} -Pn`);
  }
  process.exit(1);
});

// Manejo de errores del servidor
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Puerto ${PORT} ya está en uso.`);
    console.error(`💡 Usa el script: ./start-server.sh restart`);
    process.exit(1);
  } else {
    console.error('Error del servidor:', error);
  }
});


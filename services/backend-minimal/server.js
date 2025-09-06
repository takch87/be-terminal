/*
  BeTerminal backend mínimo para Stripe Terminal (Tap to Pay en Android)
  Endpoints:
  - POST /connection_token -> {secret}
  - POST /create_payment_intent -> {id, client_secret, status}
*/
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || '*').split(',');
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn('[WARN] Falta STRIPE_SECRET_KEY en .env. Los endpoints de Stripe fallarán hasta configurarlo.');
}

const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: false }));
app.use(morgan('tiny'));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Genera connection token para inicializar el SDK de Terminal en el dispositivo
app.post('/connection_token', async (_req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Backend sin STRIPE_SECRET_KEY' });
  try {
    const token = await stripe.terminal.connectionTokens.create();
    res.json({ secret: token.secret });
  } catch (err) {
    console.error('connection_token error', err);
    res.status(500).json({ error: 'No se pudo crear connection_token' });
  }
});

// Crea un PaymentIntent para cobro presencial (card_present)
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

    const pi = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      description: description || undefined,
      metadata: event_code ? { event_code } : undefined
    });

    res.json({ id: pi.id, client_secret: pi.client_secret, status: pi.status });
  } catch (err) {
    console.error('create_payment_intent error', err);
    res.status(500).json({ error: 'No se pudo crear PaymentIntent' });
  }
});

app.listen(PORT, () => {
  console.log(`BeTerminal backend escuchando en http://localhost:${PORT}`);
});


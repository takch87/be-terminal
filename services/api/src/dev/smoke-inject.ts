import { buildServer } from '../server';
import { env } from '../config/env';

async function main() {
  const app = await buildServer();
  const out: any = { mode: 'inject', stripeKey: !!env.STRIPE_SECRET_KEY };

  out.summary = await app.inject({ method: 'GET', url: '/reports/summary' }).then(r => ({ status: r.statusCode, body: r.json() }));
  out.login = await app.inject({ method: 'POST', url: '/auth/login', payload: { deviceLabel: 'DEVICE_001' } }).then(r => ({ status: r.statusCode, body: r.json() }));
  out.createPI = await app.inject({ method: 'POST', url: '/payments/intents', payload: { eventId: 'evt_local', amount: 500, currency: 'usd' } }).then(r => ({ status: r.statusCode, body: r.json() }));
  try {
    out.connectionToken = await app.inject({ method: 'POST', url: '/terminal/connection_token' }).then(r => ({ status: r.statusCode, body: r.json() }));
  } catch (e: any) {
    out.connectionToken = { error: e?.message };
  }

  console.log(JSON.stringify(out, null, 2));
  await app.close();
}

main();
import 'dotenv/config';

const base = process.env.APP_BASE_URL || 'http://localhost:4000';

async function j(path: string, init?: RequestInit) {
  const res = await fetch(base + path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch {
    return { status: res.status, body: text };
  }
}

(async () => {
  const out: any = { base };

  out.summary = await j('/reports/summary');
  out.login = await j('/auth/login', { method: 'POST', body: JSON.stringify({ deviceLabel: 'DEVICE_001' }) });
  const pi = await j('/payments/intents', { method: 'POST', body: JSON.stringify({ eventId: 'evt_local', amount: 500, currency: 'usd' }) });
  out.createPI = pi;
  out.connectionToken = await j('/terminal/connection_token', { method: 'POST' });

  console.log(JSON.stringify(out, null, 2));
})();
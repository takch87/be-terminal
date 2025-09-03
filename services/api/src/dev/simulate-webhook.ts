import { buildServer } from '../../src/server';

async function main() {
  const piId = process.argv[2];
  const status = process.argv[3] || 'succeeded';
  if (!piId) {
    console.error('Usage: tsx src/dev/simulate-webhook.ts <payment_intent_id> [status]');
    process.exit(1);
  }
  const app = await buildServer();
  const payload = {
    type: `payment_intent.${status}`,
    data: { object: { id: piId, status } },
  };
  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/stripe',
    payload,
    headers: { 'content-type': 'application/json' },
  });
  console.log(res.statusCode, res.body);
  await app.close();
}

main();

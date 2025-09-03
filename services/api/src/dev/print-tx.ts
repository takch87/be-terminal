import { db } from '../../src/db/client';

async function main() {
  const piId = process.argv[2];
  if (!piId) {
    console.error('Usage: tsx src/dev/print-tx.ts <payment_intent_id>');
    process.exit(1);
  }
  const tx = await db.transaction.findUnique({ where: { stripePiId: piId } });
  if (!tx) {
    console.error('Transaction not found for', piId);
    process.exit(2);
  }
  console.log(JSON.stringify({ id: tx.id, stripePiId: tx.stripePiId, status: tx.status, amount: tx.amount, currency: tx.currency, eventId: tx.eventId }, null, 2));
}

main().finally(async () => {
  await db.$disconnect();
});

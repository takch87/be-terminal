import { z } from 'zod';
import { db } from '../db/client';
import { stripe } from './stripe.service';

export const CreatePiSchema = z.object({
  eventId: z.string(),
  amount: z
    .number()
    .int()
    .min(1, 'amount must be at least 1 cent')
    .max(99_999_999, 'amount exceeds max 99,999,999 cents'),
  currency: z.string().default('usd'),
});

export async function createPaymentIntent(input: z.infer<typeof CreatePiSchema>) {
  const event = await db.event.findUnique({ where: { id: input.eventId } });
  if (!event) throw new Error('Event not found');
  const pi = await stripe.paymentIntents.create({
    amount: input.amount,
    currency: input.currency,
    metadata: { eventId: input.eventId },
    payment_method_types: ['card_present'],
    capture_method: 'automatic',
  });
  await db.transaction.create({ data: { eventId: input.eventId, amount: input.amount, currency: input.currency, stripePiId: pi.id, status: pi.status } });
  return { id: pi.id, clientSecret: pi.client_secret! };
}

export async function capturePaymentIntent(id: string) {
  const captured = await stripe.paymentIntents.capture(id);
  await db.transaction.update({ where: { stripePiId: id }, data: { status: captured.status } });
  return { ok: true };
}

export async function refundPaymentIntent(id: string, amount?: number) {
  // Refund by payment_intent; Stripe will pick the latest charge
  const refund = await stripe.refunds.create({ payment_intent: id, amount });
  await db.transaction.updateMany({ where: { stripePiId: id }, data: { status: 'refunded' } });
  return { id: refund.id, status: refund.status };
}
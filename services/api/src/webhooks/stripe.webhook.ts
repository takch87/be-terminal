import type { FastifyInstance } from 'fastify';
import { env } from '../config/env';
import { stripe } from '../services/stripe.service';
import { db } from '../db/client';

export default async function stripeWebhook(app: FastifyInstance) {
  app.post('/stripe', { config: { rawBody: true } }, async (req, reply) => {
    const sig = (req.headers['stripe-signature'] || '') as string;
    const raw = (req as any).rawBody as string;
    try {
      let evt: any;
      if (env.STRIPE_WEBHOOK_SECRET === 'whsec_dummy') {
        // Dev mode: accept plain JSON for local simulation without Stripe CLI
        evt = JSON.parse(raw || JSON.stringify((req as any).body ?? {}));
      } else {
        evt = stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
      }

      if (evt.type && String(evt.type).startsWith('payment_intent.')) {
        const pi = evt.data.object as any;
        await db.transaction.update({ where: { stripePiId: pi.id }, data: { status: pi.status } });
      }
      return reply.send({ received: true });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(400).send({ error: err.message });
    }
  });
}
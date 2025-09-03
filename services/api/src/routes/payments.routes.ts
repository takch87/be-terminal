import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreatePiSchema, createPaymentIntent, capturePaymentIntent, refundPaymentIntent } from '../services/payments.service';

export default async function paymentsRoutes(app: FastifyInstance) {
  app.post('/intents', async (req, reply) => {
    try {
      const body = CreatePiSchema.parse((req as any).body);
      const res = await createPaymentIntent(body);
      return reply.send(res);
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        return reply.code(400).send({ error: 'validation_error', details: err.errors });
      }
      return reply.code(400).send({ error: 'payment_intent_error', message: err?.message ?? 'unknown error' });
    }
  });

  app.post('/capture', async (req, reply) => {
    const body = z.object({ id: z.string() }).parse((req as any).body);
    const res = await capturePaymentIntent(body.id);
    return reply.send(res);
  });

  app.post('/refund', async (req, reply) => {
    try {
      const body = z.object({ id: z.string(), amount: z.number().int().positive().optional() }).parse((req as any).body);
      const res = await refundPaymentIntent(body.id, body.amount);
      return reply.send(res);
    } catch (err: any) {
      if (err?.name === 'ZodError') return reply.code(400).send({ error: 'validation_error', details: err.errors });
      return reply.code(400).send({ error: 'refund_error', message: err?.message ?? 'unknown error' });
    }
  });
}
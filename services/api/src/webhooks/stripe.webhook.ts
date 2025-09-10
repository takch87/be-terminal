import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { stripe } from '../services/stripe.service';
import { db } from '../db/client';

export default async function stripeWebhook(app: FastifyInstance) {
  app.post('/stripe', { config: { rawBody: true } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const sig = (req.headers['stripe-signature'] || '') as string;
    const raw = (req as any).rawBody as string;
    
    try {
      let event: any;
      
      // Enhanced webhook verification
      if (env.STRIPE_WEBHOOK_SECRET === 'whsec_dummy') {
        // Dev mode: accept plain JSON for local simulation without Stripe CLI
        event = JSON.parse(raw || JSON.stringify((req as any).body ?? {}));
        app.log.info('Webhook received (dev mode)', { 
          event_type: event.type,
          event_id: event.id 
        } as any);
      } else {
        // Production: verify webhook signature
        event = stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
        app.log.info('Webhook received (verified)', { 
          event_type: event.type,
          event_id: event.id,
          signature_verified: true
        } as any);
      }

      // Handle payment events
      switch (event.type) {
        case 'payment_intent.succeeded':
          const succeededIntent = event.data.object;
          app.log.info('Payment succeeded', { 
            payment_intent_id: succeededIntent.id,
            amount: succeededIntent.amount,
            currency: succeededIntent.currency
          } as any);
          
          // Update transaction in database
          await db.transaction.upsert({
            where: { stripePiId: succeededIntent.id },
            update: { 
              status: 'succeeded',
              amount: succeededIntent.amount,
              currency: succeededIntent.currency,
              updatedAt: new Date()
            },
            create: {
              stripePiId: succeededIntent.id,
              status: 'succeeded',
              amount: succeededIntent.amount,
              currency: succeededIntent.currency,
              metadata: succeededIntent.metadata || {}
            }
          });
          break;

        case 'payment_intent.payment_failed':
          const failedIntent = event.data.object;
          app.log.warn('Payment failed', { 
            payment_intent_id: failedIntent.id,
            amount: failedIntent.amount,
            failure_reason: failedIntent.last_payment_error?.message
          } as any);
          
          // Update transaction in database
          await db.transaction.upsert({
            where: { stripePiId: failedIntent.id },
            update: { 
              status: 'failed',
              amount: failedIntent.amount,
              currency: failedIntent.currency,
              updatedAt: new Date()
            },
            create: {
              stripePiId: failedIntent.id,
              status: 'failed',
              amount: failedIntent.amount,
              currency: failedIntent.currency,
              metadata: failedIntent.metadata || {}
            }
          });
          break;

        case 'payment_intent.requires_action':
        case 'payment_intent.processing':
          const processingIntent = event.data.object;
          app.log.info('Payment status update', { 
            payment_intent_id: processingIntent.id,
            status: processingIntent.status
          } as any);
          
          // Update status only
          await db.transaction.upsert({
            where: { stripePiId: processingIntent.id },
            update: { 
              status: processingIntent.status,
              updatedAt: new Date()
            },
            create: {
              stripePiId: processingIntent.id,
              status: processingIntent.status,
              amount: processingIntent.amount,
              currency: processingIntent.currency,
              metadata: processingIntent.metadata || {}
            }
          });
          break;

        default:
          app.log.debug('Unhandled webhook event', { event_type: event.type } as any);
      }

      return reply.send({ received: true, processed: true });
      
    } catch (err: any) {
      app.log.error('Webhook processing error', { 
        error: err.message,
        has_signature: !!sig,
        payload_length: raw?.length || 0
      } as any);
      return reply.status(400).send({ error: err.message });
    }
  });
}
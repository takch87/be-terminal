import type { FastifyInstance } from 'fastify';
import authRoutes from './auth.routes';
import paymentsRoutes from './payments.routes';
import devicesRoutes from './devices.routes';
import reportsRoutes from './reports.routes';
import stripeWebhook from '../webhooks/stripe.webhook';
import terminalRoutes from './terminal.routes';
import eventsRoutes from './events.routes';

export async function registerRoutes(app: FastifyInstance) {
  app.register(authRoutes, { prefix: '/auth' });
  app.register(devicesRoutes, { prefix: '/devices' });
  app.register(paymentsRoutes, { prefix: '/payments' });
  app.register(reportsRoutes, { prefix: '/reports' });
  app.register(eventsRoutes, { prefix: '/events' });
  app.register(terminalRoutes, { prefix: '/terminal' });
  app.register(stripeWebhook, { prefix: '/webhooks' });
}
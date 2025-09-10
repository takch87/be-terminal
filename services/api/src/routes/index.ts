import type { FastifyInstance } from 'fastify';
import authRoutes from './auth.routes';
import paymentsRoutes from './payments.routes';
import devicesRoutes from './devices.routes';
import reportsRoutes from './reports.routes';
import stripeWebhook from '../webhooks/stripe.webhook';
import terminalRoutes from './terminal.routes';
import eventsRoutes from './events.routes';
import healthRoutes from './health.routes';

export async function registerRoutes(app: FastifyInstance) {
  // Health check routes (no prefix)
  app.register(healthRoutes);
  
  // API routes with versioning
  app.register(authRoutes, { prefix: '/v1/auth' });
  app.register(devicesRoutes, { prefix: '/v1/devices' });
  app.register(paymentsRoutes, { prefix: '/v1/payments' });
  app.register(reportsRoutes, { prefix: '/v1/reports' });
  app.register(eventsRoutes, { prefix: '/v1/events' });
  app.register(terminalRoutes, { prefix: '/v1/terminal' });
  
  // Webhooks (no versioning, external services)
  app.register(stripeWebhook, { prefix: '/webhooks' });
  
  // Legacy API routes (backward compatibility)
  app.register(authRoutes, { prefix: '/auth' });
  app.register(devicesRoutes, { prefix: '/devices' });
  app.register(paymentsRoutes, { prefix: '/payments' });
  app.register(reportsRoutes, { prefix: '/reports' });
  app.register(eventsRoutes, { prefix: '/events' });
  app.register(terminalRoutes, { prefix: '/terminal' });
}
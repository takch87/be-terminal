import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (req, reply) => {
    return reply.send({ 
      status: 'ok',
      service: 'BeTerminal API',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Webhook health check
  app.get('/webhooks/health', async (req, reply) => {
    return reply.send({ 
      status: 'ok',
      webhooks: {
        stripe: {
          endpoint: '/webhooks/stripe',
          configured: process.env.STRIPE_WEBHOOK_SECRET !== 'whsec_dummy'
        }
      },
      timestamp: new Date().toISOString()
    });
  });
}

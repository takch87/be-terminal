import type { FastifyInstance } from 'fastify';
import { db } from '../db/client';

export default async function eventsRoutes(app: FastifyInstance) {
  app.get('/', async (_req, reply) => {
    const events = await db.event.findMany({ select: { id: true, name: true, status: true } });
    return reply.send({ events });
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client';

export default async function devicesRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const body = z.object({ deviceId: z.string(), eventId: z.string() }).parse((req as any).body);
    await db.device.update({ where: { id: body.deviceId }, data: { eventId: body.eventId, lastSeen: new Date() } });
    return reply.send({ ok: true });
  });
}
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { z } from 'zod';

export default async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (req, reply) => {
    const body = z.object({ deviceLabel: z.string() }).parse((req as any).body);
    // upsert device
    const device = await db.device.upsert({
      where: { id: body.deviceLabel },
      update: { lastSeen: new Date() },
      create: { id: body.deviceLabel, label: body.deviceLabel },
    });
    const token = await (app as any).jwt.sign({ did: device.id });
    const events = await db.event.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, currency: true } });
    return reply.send({ token, deviceId: device.id, events });
  });
}
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client';

export default async function reportsRoutes(app: FastifyInstance) {
  app.get('/summary', async (req, reply) => {
    const { eventId, from, to } = (req as any).query as { eventId?: string; from?: string; to?: string };
    const where: any = { };
    if (eventId) where.eventId = eventId;
    if (from || to) where.createdAt = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
    const rows = await db.transaction.findMany({ where });
    const total = rows.reduce((s: number, r: any) => s + r.amount, 0);
    const count = rows.length;
    const avg = count ? total / count : 0;
    const fees = Math.round(total * 0.03);
    const net = total - fees;
    return reply.send({ total, count, avg, fees, net });
  });

  app.post('/close-day', async (req, reply) => {
    const { eventId } = (req as any).body as { eventId?: string };
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const where: any = { createdAt: { gte: start, lte: end } };
    if (eventId) where.eventId = eventId;
    const rows = await db.transaction.findMany({ where });
    const total = rows.reduce((s: number, r: any) => s + r.amount, 0);
    const count = rows.length;
    const fees = Math.round(total * 0.03);
    const net = total - fees;
    return reply.send({ date: now.toISOString().slice(0, 10), eventId: eventId ?? null, total, net, count, closedAt: new Date().toISOString() });
  });
}
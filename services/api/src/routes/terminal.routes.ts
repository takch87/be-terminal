import type { FastifyInstance } from 'fastify';
import { createConnectionToken } from '../services/terminal.service';

export default async function terminalRoutes(app: FastifyInstance) {
  app.post('/connection_token', async (_req, reply) => {
    const res = await createConnectionToken();
    return reply.send(res);
  });
}
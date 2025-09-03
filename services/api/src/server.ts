import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rawBody from 'fastify-raw-body';

import { env } from './config/env';
import { registerRoutes } from './routes';

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(rawBody, { field: 'rawBody', global: false, encoding: 'utf8', runFirst: true });

  await registerRoutes(app);
  return app;
}
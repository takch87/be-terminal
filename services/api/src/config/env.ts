import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from the service root to work regardless of current working dir
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../.env') });
loadEnv();

const schema = z.object({
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  JWT_SECRET: z.string(),
  DATABASE_URL: z.string().url().or(z.string()),
  APP_BASE_URL: z.string().optional(),
});

export const env = schema.parse(process.env);
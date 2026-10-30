import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  FRONTEND_URL: z.string().url(),
  BACKEND_URL: z.string().url(),
  JOB_SECRET: z.string().min(16).optional().or(z.literal('').transform(() => undefined)),
  UPLOAD_DIR: z.string().default('uploads'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const i of parsed.error.issues) console.error(` - ${i.path.join('.')}: ${i.message}`);
  console.error('Copy backend/.env.example to backend/.env and fill in the values.');
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

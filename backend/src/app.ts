import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { env, isProd } from './config/env';
import { csrfGuard, requireAdmin, requireAuth } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error';
import auth from './routes/auth';
import ingredients from './routes/ingredients';
import products from './routes/products';
import orders from './routes/orders';
import suppliers from './routes/suppliers';
import dashboard from './routes/dashboard';
import transactions from './routes/transactions';
import reports from './routes/reports';
import { audits, email, jobs, settings, users } from './routes/admin';

export function createApp() {
  const app = express();
  if (isProd) app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR), { maxAge: '7d' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  api.use(csrfGuard);
  api.use('/jobs', jobs); // secret-header protected, no cookie
  api.use('/auth', auth);
  api.use('/dashboard', requireAuth, dashboard);
  api.use('/ingredients', requireAuth, ingredients);
  api.use('/products', requireAuth, products);
  api.use('/orders', requireAuth, orders);
api.use('/suppliers', requireAuth, suppliers);
  api.use('/transactions', requireAuth, transactions);
  api.use('/reports', requireAuth, reports);
  api.use('/settings', requireAuth, (req, res, next) => (req.method === 'GET' ? next() : requireAdmin(req, res, next)), settings);
  api.use('/users', requireAuth, requireAdmin, users);
  api.use('/email', requireAuth, requireAdmin, email);
  api.use('/audit-logs', requireAuth, requireAdmin, audits);
  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env, isProd } from '../config/env';
import { prisma } from '../config/db';
import { AppError } from '../lib/errors';

export const COOKIE = 'ab_session';
declare global { namespace Express { interface Request { user?: { id: string; email: string; name: string; role: Role } } } }

export const cookieOptions = {
  httpOnly: true, secure: isProd, sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax', maxAge: 8 * 3600 * 1000, path: '/',
};
export const signSession = (userId: string, tv: number) => jwt.sign({ sub: userId, tv }, env.JWT_SECRET, { expiresIn: '8h' });

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const raw = req.cookies?.[COOKIE];
  if (!raw) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
  let payload: any;
  try { payload = jwt.verify(raw, env.JWT_SECRET); } catch { throw new AppError(401, 'SESSION_EXPIRED', 'Your session expired. Please sign in again.'); }
  const u = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!u || !u.active || u.tokenVersion !== payload.tv) throw new AppError(401, 'SESSION_EXPIRED', 'Your session expired. Please sign in again.');
  req.user = { id: u.id, email: u.email, name: u.name, role: u.role };
  next();
}

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only an admin can do this.');
  next();
};

/** CSRF defence: state-changing requests must carry a custom header, which browsers only allow from origins CORS permits. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path.indexOf('/jobs/') !== 0 && req.get('x-requested-with') !== 'angels-burger') {
    throw new AppError(403, 'CSRF_REJECTED', 'Request rejected.');
  }
  next();
}

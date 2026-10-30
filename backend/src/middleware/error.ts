import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
import { isProd } from '../config/env';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } });
}
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'That value already exists.' } });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(422).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Image must be 2 MB or smaller.' } });
  }
  console.error('[error]', isProd ? err?.message : err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } });
}

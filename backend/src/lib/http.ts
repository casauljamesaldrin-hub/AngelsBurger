import { Response } from 'express';
import { z, ZodTypeAny } from 'zod';
import { AppError } from './errors';

export const ok = (res: Response, data: unknown, message = 'OK', status = 200) =>
  res.status(status).json({ success: true, data, message });

export function validate<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new AppError(422, 'VALIDATION_ERROR', r.error.issues[0]?.message ?? 'Invalid input',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export const pageParams = (q: any) => {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
};

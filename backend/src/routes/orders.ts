import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { AppError } from '../lib/errors';
import { ok, pageParams, validate } from '../lib/http';
import { requireAdmin } from '../middleware/auth';
import { cancelOrder, completeOrder, createOrder } from '../services/order.service';
import { kickOutbox } from '../services/notification.service';

const r = Router();
const include = { items: true, user: { select: { id: true, name: true } } } as const;

r.get('/', async (req, res) => {
  const { page, pageSize, skip } = pageParams(req.query);
  const where = {
    ...(req.user!.role === 'STAFF' ? { userId: req.user!.id } : {}),
    ...(['CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(String(req.query.status)) ? { status: req.query.status as any } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.order.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take: pageSize }), prisma.order.count({ where }),
  ]);
  ok(res, { items, total, page, pageSize });
});

r.post('/', async (req, res) => {
  const b = validate(z.object({
    idempotencyKey: z.string().min(8).max(100), paymentMethod: z.enum(['CASH', 'GCASH', 'CARD', 'OTHER']).optional(), notes: z.string().max(300).optional(),
    items: z.array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(500), optionIds: z.array(z.string().uuid()).max(20).default([]) })).min(1).max(40),
  }), req.body);
  const { order, duplicate } = await createOrder(b, req.user!.id);
  kickOutbox();
  ok(res, order, duplicate ? 'This order was already recorded' : 'Order confirmed', duplicate ? 200 : 201);
});

r.get('/:id', async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: { ...include, transactions: { include: { ingredient: { select: { name: true } } } } } });
  if (!o || (req.user!.role === 'STAFF' && o.userId !== req.user!.id)) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  ok(res, o);
});

r.post('/:id/complete', async (req, res) => {
  const b = validate(z.object({ paymentMethod: z.enum(['CASH', 'GCASH', 'CARD', 'OTHER']).optional() }), req.body ?? {});
  const o = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
  if (o && req.user!.role === 'STAFF' && o.userId !== req.user!.id) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  ok(res, await completeOrder(String(req.params.id), req.user!.id, b.paymentMethod), 'Order completed and recorded as a sale');
});

r.post('/:id/cancel', requireAdmin, async (req, res) => {
  const b = validate(z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300), restoreStock: z.boolean() }), req.body);
  const o = await cancelOrder(String(req.params.id), req.user!.id, b.reason, b.restoreStock);
  kickOutbox();
  ok(res, o, b.restoreStock ? 'Order cancelled and stock restored' : 'Order cancelled; stock was NOT restored');
});
export default r;

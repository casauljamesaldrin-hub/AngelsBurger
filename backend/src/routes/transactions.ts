import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { ok, pageParams } from '../lib/http';
import { rangeFromQuery } from '../lib/time';
import { toCsv } from '../lib/csv';
import { audit } from '../services/audit.service';

const r = Router();
const TYPES = ['STOCK_IN', 'STOCK_OUT', 'WASTE', 'ADJUSTMENT', 'ORDER_DEDUCTION', 'REVERSAL'];

function filters(req: any): Prisma.InventoryTransactionWhereInput {
  const q = req.query;
  // Staff only ever see stock changes they made themselves. Admins see everything.
// Applied to the list AND the CSV export, so a staff member cannot download anyone else's activity.
const scoped = (req: any) => {
  const base = filters(req);
  return req.user!.role === 'STAFF' ? { AND: [base, { userId: req.user!.id }] } : base;
};
  const where: Prisma.InventoryTransactionWhereInput = {};
  if (q.from || q.to) { const { from, to } = rangeFromQuery(q); where.createdAt = { gte: from, lt: to }; }
  if (TYPES.includes(q.type)) where.type = q.type;
  if (q.ingredientId) where.ingredientId = String(q.ingredientId);
  if (q.orderId) where.orderId = String(q.orderId);
  if (q.userId && req.user.role === 'ADMIN') where.userId = String(q.userId);
  if (req.user.role === 'STAFF') where.userId = req.user.id; // staff see only their own history
  return where;
}
const inc = { ingredient: { select: { name: true } }, user: { select: { name: true } }, order: { select: { orderNumber: true } } } as const;

r.get('/', async (req, res) => {
  const { page, pageSize, skip } = pageParams(req.query);
  const where = filters(req);
  const [items, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({ where, include: inc, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
    prisma.inventoryTransaction.count({ where }),
  ]);
  ok(res, { items, total, page, pageSize });
});

r.get('/export.csv', async (req, res) => {
  const rows = await prisma.inventoryTransaction.findMany({ where: filters(req), include: inc, orderBy: { createdAt: 'desc' }, take: 10000 });
  await audit(prisma, req.user!.id, 'EXPORT', 'InventoryTransaction', undefined, { rows: rows.length });
  res.type('text/csv').attachment('transactions.csv').send(toCsv(rows.map((t) => ({
    time: t.createdAt, ingredient: t.ingredient.name, type: t.type, change: t.quantityChange.toString(), before: t.quantityBefore.toString(),
    after: t.quantityAfter.toString(), unit: t.unit, reason: t.reason, notes: t.notes, order: t.order?.orderNumber, by: t.user.name,
  }))));
});
export default r;

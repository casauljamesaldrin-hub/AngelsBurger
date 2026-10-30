import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { AppError } from '../lib/errors';
import { ok, validate } from '../lib/http';
import { rangeFromQuery, TZ } from '../lib/time';
import { toCsv } from '../lib/csv';
import { stockState } from '../lib/calc';
import { audit } from '../services/audit.service';
import dailySales from './dailySales';

const r = Router();
r.use('/daily-sales', dailySales);    
const NAMES = ['inventory', 'low-stock', 'stock-in', 'usage', 'waste', 'adjustments', 'sales', 'products', 'orders', 'staff', 'profit'] as const;
const q = z.object({ report: z.enum(NAMES), period: z.enum(['day', 'week', 'month']).default('day') });
const peso = (c: number) => (c / 100).toFixed(2);

async function txRows(types: string[], from: Date, to: Date) {
  const t = await prisma.inventoryTransaction.findMany({ where: { type: { in: types as any }, createdAt: { gte: from, lt: to } }, include: { ingredient: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5000 });
  return t.map((x) => ({ time: x.createdAt.toISOString(), ingredient: x.ingredient.name, type: x.type, change: x.quantityChange.toString(), unit: x.unit, reason: x.reason ?? '', notes: x.notes ?? '', by: x.user.name }));
}

async function build(name: (typeof NAMES)[number], period: string, from: Date, to: Date): Promise<Record<string, unknown>[]> {
  switch (name) {
    case 'inventory': case 'low-stock': {
      const all = await prisma.ingredient.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
      const rows = all.map((i) => ({ ingredient: i.name, quantity: i.quantity.toString(), unit: i.unit, minimum: i.minThreshold.toString(), status: stockState(i.quantity.toString(), i.minThreshold.toString()), unitCost: i.unitCostCentavos == null ? '' : peso(i.unitCostCentavos), value: i.unitCostCentavos == null ? '' : peso(Math.round(Number(i.quantity) * i.unitCostCentavos)) }));
      return name === 'low-stock' ? rows.filter((x) => x.status !== 'IN') : rows;
    }
    case 'stock-in': return txRows(['STOCK_IN'], from, to);
    case 'usage': return txRows(['STOCK_OUT', 'ORDER_DEDUCTION'], from, to);
    case 'waste': return txRows(['WASTE'], from, to);
    case 'adjustments': return txRows(['ADJUSTMENT', 'REVERSAL'], from, to);
    case 'sales':
      return (await prisma.$queryRaw<any[]>`SELECT to_char(date_trunc(${period}, ("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS period, COUNT(*)::int AS orders, (COALESCE(SUM("totalCentavos"),0)/100.0)::float AS revenue_php FROM "Order" WHERE status='COMPLETED' AND "completedAt" >= ${from} AND "completedAt" < ${to} GROUP BY 1 ORDER BY 1`);
    case 'products':
      return (await prisma.$queryRaw<any[]>`SELECT oi."productName" AS product, SUM(oi.quantity)::int AS units_sold, (SUM(oi."lineTotalCentavos")/100.0)::float AS revenue_php FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId" WHERE o.status='COMPLETED' AND o."completedAt" >= ${from} AND o."completedAt" < ${to} GROUP BY 1 ORDER BY 2 DESC`);
    case 'orders': {
      const o = await prisma.order.findMany({ where: { createdAt: { gte: from, lt: to } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5000 });
      return o.map((x) => ({ order: x.orderNumber, time: x.createdAt.toISOString(), status: x.status, payment: x.paymentStatus, method: x.paymentMethod ?? '', total_php: peso(x.totalCentavos), by: x.user.name }));
    }
    case 'staff':
      return (await prisma.$queryRaw<any[]>`SELECT u.name AS staff, COUNT(t.id)::int AS inventory_actions, (SELECT COUNT(*)::int FROM "Order" o WHERE o."userId" = u.id AND o."createdAt" >= ${from} AND o."createdAt" < ${to}) AS orders_taken FROM "User" u LEFT JOIN "InventoryTransaction" t ON t."userId" = u.id AND t."createdAt" >= ${from} AND t."createdAt" < ${to} GROUP BY u.id, u.name ORDER BY u.name`);
    case 'profit': {
      // Estimated from CURRENT ingredient costs; revenue is NOT profit. Rows with missing costs are flagged.
      const rev = await prisma.order.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: from, lt: to } }, _sum: { totalCentavos: true } });
      const cost = await prisma.$queryRaw<{ cost: number; missing: number }[]>`SELECT COALESCE(SUM(ABS(t."quantityChange") * COALESCE(i."unitCostCentavos",0)),0)::float AS cost, COUNT(*) FILTER (WHERE i."unitCostCentavos" IS NULL)::int AS missing FROM "InventoryTransaction" t JOIN "Ingredient" i ON i.id = t."ingredientId" JOIN "Order" o ON o.id = t."orderId" WHERE t.type='ORDER_DEDUCTION' AND o.status='COMPLETED' AND o."completedAt" >= ${from} AND o."completedAt" < ${to}`;
      const revenue = rev._sum.totalCentavos ?? 0; const c = Math.round(cost[0]?.cost ?? 0);
      return [{ recorded_revenue_php: peso(revenue), estimated_ingredient_cost_php: peso(c), estimated_gross_profit_php: peso(revenue - c), ingredients_missing_cost: cost[0]?.missing ?? 0, note: 'Estimate only. Uses current unit costs; ingredients without a cost count as 0.' }];
    }
  }
}

r.get('/export.csv', async (req, res) => {
  if (req.user!.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only an admin can export reports.');
  const p = validate(q, req.query); const { from, to } = rangeFromQuery(req.query);
  const rows = await build(p.report, p.period, from, to);
  await audit(prisma, req.user!.id, 'EXPORT', 'Report', p.report, { rows: rows.length });
  res.type('text/csv').attachment(`${p.report}.csv`).send(toCsv(rows));
});

r.get('/:report', async (req, res) => {
  if (req.user!.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only an admin can view reports.');
  const p = validate(q, { report: req.params.report, period: req.query.period });
  const { from, to } = rangeFromQuery(req.query);
  ok(res, await build(p.report, p.period, from, to));
});
export default r;

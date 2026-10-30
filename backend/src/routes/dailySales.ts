import { Router } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../lib/errors';
import { ok } from '../lib/http';

// DAILY SALES REPORT  (GET /api/reports/daily-sales?from=YYYY-MM-DD&to=YYYY-MM-DD)
//
// - Counts COMPLETED orders only, the same rule the app already uses for "recorded as a sale".
//   Cancelled orders are excluded, so a cancelled (refunded) sale never counts as income.
// - Every figure comes from the price SAVED on each order line (unitPriceCentavos / lineTotalCentavos),
//   never from the product's current price, so later price changes cannot rewrite past sales.
// - Sales revenue only. Ingredient costs are not read here and nothing is labelled profit.
// - Admin only. Money is in centavos (whole numbers), like the rest of the app.
const r = Router();

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86_400_000;
const MAX_DAYS = 366;
const manila = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });

// The Philippines has no daylight saving: a Manila day always runs 00:00 to 24:00 at +08:00.
function dayStart(value: string, field: string): Date {
  const t = new Date(`${value}T00:00:00+08:00`);
  // The round-trip also rejects impossible dates such as 2026-02-31 (JavaScript would roll them into March).
  if (!DAY.test(value) || isNaN(t.getTime()) || manila.format(t) !== value) {
    throw new AppError(422, 'BAD_DATE', `${field} must be a real date in YYYY-MM-DD format.`);
  }
  return t;
}

function eachDay(fromDay: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${fromDay}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

r.get('/', async (req, res) => {
  if (req.user!.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only an admin can view sales reports.');

  const today = manila.format(new Date());
  const fromDay = req.query.from ? String(req.query.from) : today;
  const toDay = req.query.to ? String(req.query.to) : fromDay;
  const fromT = dayStart(fromDay, 'from');
  const toT = dayStart(toDay, 'to');
  if (toT.getTime() < fromT.getTime()) throw new AppError(422, 'BAD_RANGE', 'The end date cannot be before the start date.');
  const dayCount = Math.round((toT.getTime() - fromT.getTime()) / MS_DAY) + 1;
  if (dayCount > MAX_DAYS) throw new AppError(422, 'RANGE_TOO_LONG', `Choose a range of ${MAX_DAYS} days or less.`);

  const from = fromT;
  const to = new Date(toT.getTime() + MS_DAY); // exclusive end, so the last day is fully included

  const [sold, completed, cancelledOrders] = await Promise.all([
    // One row per product AND saved selling price. A product sold at two prices shows as two correct rows.
    prisma.orderItem.groupBy({
      by: ['productId', 'productName', 'unitPriceCentavos'],
      _sum: { quantity: true, lineTotalCentavos: true },
      where: { order: { status: 'COMPLETED', completedAt: { gte: from, lt: to } } },
    }),
    // The orders themselves. They are sorted into Manila days here in code (not in SQL), so the day
    // can never be shifted by a database time-zone setting.
    prisma.order.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: from, lt: to } },
      select: { completedAt: true, totalCentavos: true, paymentMethod: true },
    }),
    prisma.order.count({ where: { status: 'CANCELLED', createdAt: { gte: from, lt: to } } }),
  ]);

  const products = sold
    .map((s) => ({
      productId: s.productId,
      productName: s.productName,
      unitPriceCentavos: s.unitPriceCentavos,
      quantity: s._sum.quantity ?? 0,
      totalCentavos: s._sum.lineTotalCentavos ?? 0,
    }))
    .sort((a, b) => b.totalCentavos - a.totalCentavos || a.productName.localeCompare(b.productName));

  const byDay = new Map<string, { orders: number; income: number }>();
  const byMethod = new Map<string, { orders: number; income: number }>();
  for (const o of completed) {
    const m = byMethod.get(o.paymentMethod ?? 'NONE') ?? { orders: 0, income: 0 };
    m.orders += 1;
    m.income += o.totalCentavos;
    byMethod.set(o.paymentMethod ?? 'NONE', m);
    const key = manila.format(o.completedAt!);
    const d = byDay.get(key) ?? { orders: 0, income: 0 };
    d.orders += 1;
    d.income += o.totalCentavos;
    byDay.set(key, d);
  }
  // Income by how the customer paid (cash, GCash, ...). 'NONE' = no method was recorded on the order.
  const payments = [...byMethod].map(([method, v]) => ({ method, orders: v.orders, incomeCentavos: v.income }))
    .sort((a, b) => b.incomeCentavos - a.incomeCentavos);
  const daily = eachDay(fromDay, dayCount).map((day) => ({
    day,
    orders: byDay.get(day)?.orders ?? 0,
    incomeCentavos: byDay.get(day)?.income ?? 0,
  }));

  ok(res, {
    range: { from: fromDay, to: toDay },
    products,
    totals: {
      itemsSold: products.reduce((a, p) => a + p.quantity, 0),
      incomeCentavos: products.reduce((a, p) => a + p.totalCentavos, 0), // sum of all product sales
      orders: completed.length,
    },
    daily,
    payments,
    cancelledOrders,
  });
});

export default r;
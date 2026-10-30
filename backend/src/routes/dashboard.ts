import { Router } from 'express';
import Decimal from 'decimal.js';
import { prisma } from '../config/db';
import { ok } from '../lib/http';
import { dayRange, todayManila, TZ } from '../lib/time';
import { periodStats, stockAlerts } from '../services/stats.service';

const r = Router();

const manilaDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

// Maps a Manila day (YYYY-MM-DD) to the first day of its week (Monday) or month.
function bucketOf(day: string, period: string): string {
  if (period === 'month') return `${day.slice(0, 7)}-01`;
  if (period === 'week') {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday = 0
    return d.toISOString().slice(0, 10);
  }
  return day;
}

r.get('/summary', async (_req, res) => {
  const { from, to } = dayRange(todayManila());
  const [stats, alerts, ingredients, products, recentTx, recentSales, soldToday] = await Promise.all([
    periodStats(from, to), stockAlerts(),
    prisma.ingredient.findMany({ where: { active: true }, select: { quantity: true, unitCostCentavos: true } }),
    prisma.product.count({ where: { active: true } }),
    prisma.inventoryTransaction.findMany({ take: 8, orderBy: { createdAt: 'desc' }, include: { ingredient: { select: { name: true } }, user: { select: { name: true } } } }),
    prisma.order.findMany({ take: 6, where: { status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, select: { id: true, orderNumber: true, totalCentavos: true, completedAt: true } }),
    // Per-product units and revenue for today, from the price saved on each order line.
    prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      _sum: { quantity: true, lineTotalCentavos: true },
      where: { order: { status: 'COMPLETED', completedAt: { gte: from, lt: to } } },
    }),
  ]);

  let value = new Decimal(0); let valueComplete = true;
  for (const i of ingredients) { if (i.unitCostCentavos == null) valueComplete = false; else value = value.plus(new Decimal(i.quantity.toString()).times(i.unitCostCentavos)); }

  const topProducts = soldToday
    .map((s) => ({ name: s.productName, qty: s._sum.quantity ?? 0, revenueCentavos: s._sum.lineTotalCentavos ?? 0 }))
    .sort((a, b) => b.qty - a.qty || b.revenueCentavos - a.revenueCentavos || a.name.localeCompare(b.name))
    .slice(0, 5);

  ok(res, {
    activeIngredients: ingredients.length, activeProducts: products,
    inventoryValueCentavos: value.round().toNumber(), inventoryValueComplete: valueComplete,
    lowStock: alerts.filter((a) => a.state === 'LOW'), outOfStock: alerts.filter((a) => a.state === 'OUT'),
    today: { ...stats, topProducts }, recentTransactions: recentTx, recentSales,
  });
});

r.get('/stock-alerts', async (_req, res) => ok(res, await stockAlerts()));
r.get('/recent-transactions', async (_req, res) => ok(res, await prisma.inventoryTransaction.findMany({ take: 20, orderBy: { createdAt: 'desc' }, include: { ingredient: { select: { name: true } }, user: { select: { name: true } } } })));

// Completed sales chart.
// Orders are sorted into Manila days here in code (the same way the daily-sales report does it),
// so the result never depends on the database column type or time-zone setting.
r.get('/sales', async (req, res) => {
  const period = ['day', 'week', 'month'].includes(String(req.query.period)) ? String(req.query.period) : 'day';
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 14));
  const firstDay = manilaDay(new Date(Date.now() - (days - 1) * 86400_000));
  const from = dayRange(firstDay).from; // start of that Manila day

  const orders = await prisma.order.findMany({
    where: { status: 'COMPLETED', completedAt: { gte: from } },
    select: { completedAt: true, totalCentavos: true },
  });

  const buckets = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const key = bucketOf(manilaDay(o.completedAt!), period);
    const b = buckets.get(key) ?? { orders: 0, revenue: 0 };
    b.orders += 1;
    b.revenue += o.totalCentavos;
    buckets.set(key, b);
  }

  ok(res, [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, v]) => ({ label, orders: v.orders, revenue: v.revenue })));
});

export default r;
import Decimal from 'decimal.js';
import { prisma } from '../config/db';
import { stockState } from '../lib/calc';

export async function stockAlerts() {
  const all = await prisma.ingredient.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  const withState = all.map((i) => ({ ...i, state: stockState(i.quantity.toString(), i.minThreshold.toString()) }));
  const alerts = await prisma.stockAlert.findMany({ where: { active: true } });
  const detected = new Map(alerts.map((a) => [a.ingredientId, a.detectedAt]));
  return withState.filter((i) => i.state !== 'IN').map((i) => ({
    id: i.id, name: i.name, quantity: i.quantity.toString(), unit: i.unit, minThreshold: i.minThreshold.toString(),
    reorderQty: i.reorderQty?.toString() ?? null, state: i.state, detectedAt: detected.get(i.id) ?? null,
  }));
}

export async function periodStats(from: Date, to: Date) {
  const sales = await prisma.order.aggregate({
    where: { status: 'COMPLETED', completedAt: { gte: from, lt: to } }, _sum: { totalCentavos: true }, _count: true,
  });
  const ordersPlaced = await prisma.order.count({ where: { status: { not: 'CANCELLED' }, createdAt: { gte: from, lt: to } } });
  const topRaw = await prisma.orderItem.groupBy({
    by: ['productName'], _sum: { quantity: true },
    where: { order: { status: 'COMPLETED', completedAt: { gte: from, lt: to } } },
    orderBy: { _sum: { quantity: 'desc' } }, take: 5,
  });
  const usageRaw = await prisma.inventoryTransaction.groupBy({
    by: ['ingredientId', 'unit'], _sum: { quantityChange: true },
    where: { type: { in: ['ORDER_DEDUCTION', 'STOCK_OUT'] }, createdAt: { gte: from, lt: to } },
  });
  const wasteRaw = await prisma.inventoryTransaction.groupBy({
    by: ['ingredientId', 'unit'], _sum: { quantityChange: true }, where: { type: 'WASTE', createdAt: { gte: from, lt: to } },
  });
  const ids = [...new Set([...usageRaw, ...wasteRaw].map((r) => r.ingredientId))];
  const ings = await prisma.ingredient.findMany({ where: { id: { in: ids } } });
  const byId = new Map(ings.map((i) => [i.id, i]));
  const rows = (raw: typeof usageRaw) => raw.map((r) => ({
    ingredientId: r.ingredientId, name: byId.get(r.ingredientId)?.name ?? '?', unit: r.unit,
    quantity: new Decimal(r._sum.quantityChange?.toString() ?? '0').abs().toString(),
  }));
  const waste = rows(wasteRaw);
  let wasteCost = 0; let wasteCostComplete = true;
  for (const w of waste) {
    const c = byId.get(w.ingredientId)?.unitCostCentavos;
    if (c == null) wasteCostComplete = false; else wasteCost += new Decimal(w.quantity).times(c).round().toNumber();
  }
  return {
    completedOrders: sales._count, revenueCentavos: sales._sum.totalCentavos ?? 0, ordersPlaced,
    topProducts: topRaw.map((t) => ({ name: t.productName, qty: t._sum.quantity ?? 0 })),
    usage: rows(usageRaw), waste, wasteCostCentavos: wasteCost, wasteCostComplete,
  };
}

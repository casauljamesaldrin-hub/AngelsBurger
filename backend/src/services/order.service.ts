import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../config/db';
import { AppError } from '../lib/errors';
import { aggregate, lineRequirements, lineTotal } from '../lib/calc';
import { applyMovement } from './inventory.service';
import { audit } from './audit.service';

export interface OrderInput {
  idempotencyKey: string; paymentMethod?: string; notes?: string;
  items: { productId: string; quantity: number; optionIds: string[] }[];
}

const include = { items: true, user: { select: { id: true, name: true } } } as const;
const asRecipe = (r: any) => ({ ingredientId: r.ingredientId, name: r.ingredient.name, unit: r.ingredient.unit, quantity: r.quantity.toString() });

/** Validates, prices, creates the order and deducts recipe ingredients in ONE transaction. */
export async function createOrder(input: OrderInput, userId: string) {
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
  if (existing) return { order: existing, duplicate: true };

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { recipe: { include: { ingredient: true } }, options: { include: { items: { include: { ingredient: true } } } } },
  });

  const lines = input.items.map((item) => {
    const p = products.find((x) => x.id === item.productId);
    if (!p || !p.active) throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'A selected product is no longer on the menu.');
    if (!p.available) throw new AppError(409, 'PRODUCT_UNAVAILABLE', `${p.name} is currently unavailable.`);
    if (!p.recipe.length) throw new AppError(409, 'RECIPE_MISSING', `${p.name} has no recipe, so stock cannot be deducted. Ask an admin to set it up.`);
    const opts = [...new Set(item.optionIds)].map((id) => {
      const o = p.options.find((x) => x.id === id && x.active);
      if (!o) throw new AppError(409, 'OPTION_NOT_ALLOWED', `An option is not available for ${p.name}.`);
      return o;
    });
    const recipe = p.recipe.map(asRecipe);
    const reqs = lineRequirements(recipe, opts.map((o) => o.items.map(asRecipe)), item.quantity);
    return {
      product: p, opts, quantity: item.quantity, reqs,
      total: lineTotal(p.priceCentavos, opts.map((o) => o.priceCentavos), item.quantity),
      recipeSnapshot: { perUnit: recipe, optionRecipes: opts.map((o) => ({ option: o.name, items: o.items.map(asRecipe) })) },
    };
  });

  const needs = aggregate(lines.map((l) => l.reqs));
  const subtotal = lines.reduce((a, l) => a + l.total, 0);

  try {
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          idempotencyKey: input.idempotencyKey, userId, paymentMethod: input.paymentMethod, notes: input.notes,
          subtotalCentavos: subtotal, totalCentavos: subtotal,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id, productName: l.product.name, unitPriceCentavos: l.product.priceCentavos,
              quantity: l.quantity, lineTotalCentavos: l.total,
              options: l.opts.map((o) => ({ id: o.id, name: o.name, priceCentavos: o.priceCentavos })),
              recipeSnapshot: l.recipeSnapshot as unknown as Prisma.InputJsonValue,
            })),
          },
        },
      });
      const orderNumber = `AB-${String(created.seq).padStart(6, '0')}`;
      await tx.order.update({ where: { id: created.id }, data: { orderNumber } });

      // Deterministic order prevents deadlocks between concurrent orders.
      for (const n of [...needs].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId))) {
        await applyMovement(tx, {
          ingredientId: n.ingredientId, change: n.quantity.negated(), type: 'ORDER_DEDUCTION', userId,
          reason: 'Order recipe deduction', orderId: created.id, reference: orderNumber,
        });
      }
      await audit(tx, userId, 'ORDER_CONFIRMED', 'Order', created.id, { orderNumber, total: subtotal });
      return tx.order.findUniqueOrThrow({ where: { id: created.id }, include });
    }, { timeout: 20000, maxWait: 10000 });
    return { order, duplicate: false };
  } catch (e: any) {
    if (e?.code === 'P2002') { // two submissions with the same key raced; return the winner
      const o = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
      if (o) return { order: o, duplicate: true };
    }
    throw e;
  }
}

export async function completeOrder(id: string, userId: string, paymentMethod?: string) {
  const o = await prisma.order.findUnique({ where: { id } });
  if (!o) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (o.status !== 'CONFIRMED') throw new AppError(409, 'INVALID_TRANSITION', `Only confirmed orders can be completed (this one is ${o.status}).`);
  return prisma.$transaction(async (tx) => {
    const u = await tx.order.update({
      where: { id }, include,
      data: { status: 'COMPLETED', paymentStatus: 'PAID', completedAt: new Date(), paymentMethod: paymentMethod ?? o.paymentMethod },
    });
    await audit(tx, userId, 'ORDER_COMPLETED', 'Order', id);
    return u;
  });
}

/** Cancels an order. Stock is restored ONLY when the admin explicitly asks, via linked REVERSAL rows. */
export async function cancelOrder(id: string, userId: string, reason: string, restoreStock: boolean) {
  return prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id } });
    if (!o) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    if (o.status === 'CANCELLED') throw new AppError(409, 'INVALID_TRANSITION', 'Order is already cancelled.');
    if (restoreStock) {
      const deductions = await tx.inventoryTransaction.findMany({ where: { orderId: id, type: 'ORDER_DEDUCTION' }, orderBy: { id: 'asc' } });
      for (const d of deductions) {
        const done = await tx.inventoryTransaction.findUnique({ where: { reversalOfId: d.id } });
        if (done) continue;
        await applyMovement(tx, {
          ingredientId: d.ingredientId, change: new Decimal(d.quantityChange.toString()).abs(), type: 'REVERSAL',
          userId, reason: `Cancelled: ${reason}`, orderId: id, reversalOfId: d.id, reference: o.orderNumber ?? undefined,
        });
      }
    }
    const u = await tx.order.update({
      where: { id }, include,
      data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date(), paymentStatus: o.paymentStatus === 'PAID' ? 'REFUNDED' : o.paymentStatus },
    });
    await audit(tx, userId, 'ORDER_CANCELLED', 'Order', id, { reason, restoreStock });
    return u;
  });
}

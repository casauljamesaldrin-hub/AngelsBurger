import { Prisma, TxType } from '@prisma/client';
import Decimal from 'decimal.js';
import { AppError } from '../lib/errors';
import { stockState } from '../lib/calc';
import { env } from '../config/env';
import { enqueueEmail } from './notification.service';
import { stockAlertEmail } from './email.templates';

export type Tx = Prisma.TransactionClient;

export interface Movement {
  ingredientId: string; change: Decimal; type: TxType; userId: string;
  reason?: string; notes?: string; reference?: string; orderId?: string; reversalOfId?: string;
}

/**
 * The ONLY place ingredient quantity changes. Locks the row, checks the result is not negative,
 * updates the quantity, writes an immutable transaction row and refreshes stock alerts.
 * Must be called inside prisma.$transaction.
 */
export async function applyMovement(tx: Tx, m: Movement) {
  await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id = ${m.ingredientId} FOR UPDATE`;
  const ing = await tx.ingredient.findUnique({ where: { id: m.ingredientId } });
  if (!ing) throw new AppError(404, 'INGREDIENT_NOT_FOUND', 'Ingredient not found.');
  if (!ing.active && m.type !== 'REVERSAL') throw new AppError(409, 'INGREDIENT_INACTIVE', `${ing.name} is inactive.`);

  const before = new Decimal(ing.quantity.toString());
  const after = before.plus(m.change);
  if (after.isNegative()) {
    throw new AppError(409, 'INSUFFICIENT_STOCK', `Not enough ${ing.name}: ${before} ${ing.unit} available, ${m.change.abs()} needed.`);
  }
  await tx.ingredient.update({ where: { id: ing.id }, data: { quantity: after.toString() } });
  const rec = await tx.inventoryTransaction.create({
    data: {
      ingredientId: ing.id, type: m.type, quantityChange: m.change.toString(),
      quantityBefore: before.toString(), quantityAfter: after.toString(), unit: ing.unit,
      reason: m.reason, notes: m.notes, reference: m.reference, orderId: m.orderId,
      reversalOfId: m.reversalOfId, userId: m.userId,
    },
  });
  await refreshAlert(tx, ing.id, ing.name, ing.unit, after, new Decimal(ing.minThreshold.toString()));
  return rec;
}

/** Creates/resolves StockAlert rows on state changes only, so the same alert never emails twice. */
async function refreshAlert(tx: Tx, ingredientId: string, name: string, unit: string, qty: Decimal, min: Decimal) {
  const state = stockState(qty, min);
  const active = await tx.stockAlert.findFirst({ where: { ingredientId, active: true } });
  if (state === 'IN') {
    if (active) await tx.stockAlert.update({ where: { id: active.id }, data: { active: false, resolvedAt: new Date() } });
    return;
  }
  if (active?.state === state) return;
  if (active) await tx.stockAlert.update({ where: { id: active.id }, data: { active: false, resolvedAt: new Date() } });
  const alert = await tx.stockAlert.create({ data: { ingredientId, state } });

  const recipients = await tx.user.findMany({
    where: { active: true, ...(state === 'OUT' ? { notifyOutOfStock: true } : { notifyLowStock: true }) },
  });
  const mail = stockAlertEmail(state, { name, quantity: qty.toString(), unit, min: min.toString(), link: `${env.FRONTEND_URL}/inventory` });
  for (const u of recipients) {
    await enqueueEmail(tx, {
      type: state === 'OUT' ? 'OUT_OF_STOCK' : 'LOW_STOCK', recipient: u.email, ...mail,
      dedupeKey: `alert:${alert.id}:${u.id}`, userId: u.id, ingredientId,
    });
  }
}

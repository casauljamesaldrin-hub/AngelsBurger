import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { prisma } from '../config/db';
import { AppError } from '../lib/errors';
import { ok, pageParams, validate } from '../lib/http';
import { requireAdmin } from '../middleware/auth';
import { applyMovement } from '../services/inventory.service';
import { kickOutbox } from '../services/notification.service';
import { audit } from '../services/audit.service';

const r = Router();
const qty = z.coerce.number().positive('Quantity must be more than 0').max(1_000_000)
  .refine((n) => new Decimal(n).decimalPlaces() <= 3, 'Use at most 3 decimal places');
const nonneg = z.coerce.number().min(0).max(1_000_000);
const text = (n: number) => z.string().trim().max(n);

const ingredientBody = z.object({
  name: text(80).min(1), description: text(300).optional().nullable(), unit: text(20).min(1),
  minThreshold: nonneg.default(0), reorderQty: nonneg.optional().nullable(), unitCostCentavos: z.coerce.number().int().min(0).optional().nullable(),
  supplier: text(120).optional().nullable(), expiresOn: z.coerce.date().optional().nullable(), batchNote: text(120).optional().nullable(),
  active: z.boolean().optional(),
});

const SORTS: Record<string, string> = { name: '"name"', quantity: '"quantity"', unit: '"unit"', updatedAt: '"updatedAt"', minThreshold: '"minThreshold"' };

r.get('/', async (req, res) => {
  const { page, pageSize, skip } = pageParams(req.query);
  const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
  const s = String(req.query.search ?? '').trim();
  if (s) where.push(Prisma.sql`"name" ILIKE ${'%' + s + '%'}`);
  if (req.query.active !== 'all') where.push(Prisma.sql`"active" = ${req.query.active !== 'false'}`);
  const st = req.query.status;
  if (st === 'out') where.push(Prisma.sql`"quantity" <= 0`);
  if (st === 'low') where.push(Prisma.sql`"quantity" > 0 AND "quantity" <= "minThreshold"`);
  if (st === 'in') where.push(Prisma.sql`"quantity" > "minThreshold"`);
  const w = Prisma.join(where, ' AND ');
  const col = Prisma.raw(SORTS[String(req.query.sort)] ?? '"name"');
  const dir = Prisma.raw(req.query.dir === 'desc' ? 'DESC' : 'ASC');
  const items = await prisma.$queryRaw<any[]>`SELECT * FROM "Ingredient" WHERE ${w} ORDER BY ${col} ${dir} LIMIT ${pageSize} OFFSET ${skip}`;
  const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Ingredient" WHERE ${w}`;
  ok(res, { items, total: n, page, pageSize });
});

r.post('/', requireAdmin, async (req, res) => {
  const b = validate(ingredientBody, req.body);
  const created = await prisma.$transaction(async (tx) => {
    const i = await tx.ingredient.create({ data: { ...b, minThreshold: b.minThreshold.toString(), reorderQty: b.reorderQty?.toString() } });
    await audit(tx, req.user!.id, 'INGREDIENT_CREATED', 'Ingredient', i.id, { name: i.name });
    return i;
  });
  ok(res, created, 'Ingredient added', 201);
});

r.get('/:id', async (req, res) => {
  const i = await prisma.ingredient.findUnique({ where: { id: String(req.params.id) } });
  if (!i) throw new AppError(404, 'INGREDIENT_NOT_FOUND', 'Ingredient not found.');
  ok(res, i);
});

// Quantity can NOT be edited here; use stock-in / stock-out / waste / adjustments so history stays complete.
r.patch('/:id', requireAdmin, async (req, res) => {
  const b = validate(ingredientBody.partial(), req.body);
  const before = await prisma.ingredient.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw new AppError(404, 'INGREDIENT_NOT_FOUND', 'Ingredient not found.');
  if (b.unit && b.unit !== before.unit && !new Decimal(before.quantity.toString()).isZero())
    throw new AppError(409, 'UNIT_CHANGE_BLOCKED', 'Change the unit only when stock is 0, otherwise recorded quantities would change meaning.');
  const updated = await prisma.$transaction(async (tx) => {
    const i = await tx.ingredient.update({ where: { id: String(req.params.id) }, data: { ...b, minThreshold: b.minThreshold?.toString(), reorderQty: b.reorderQty?.toString() } });
    await audit(tx, req.user!.id, b.active === false ? 'INGREDIENT_DEACTIVATED' : 'INGREDIENT_UPDATED', 'Ingredient', i.id, { fields: Object.keys(b) });
    return i;
  });
  ok(res, updated, 'Ingredient saved');
});

async function move(req: any, res: any, type: 'STOCK_IN' | 'STOCK_OUT' | 'WASTE', sign: 1 | -1, b: any, label: string, extra?: (tx: Prisma.TransactionClient) => Promise<void>) {
  const t = await prisma.$transaction(async (tx) => {
    await extra?.(tx);
    const rec = await applyMovement(tx, {
      ingredientId: String(req.params.id), change: new Decimal(b.quantity).times(sign), type, userId: req.user.id,
      reason: b.reason, notes: b.notes, reference: b.reference,
    });
    await audit(tx, req.user.id, type, 'Ingredient', String(req.params.id), { quantity: b.quantity, reason: b.reason ?? null });
    return rec;
  }, { timeout: 15000 });
  kickOutbox(); // only after the commit succeeded
  ok(res, t, label, 201);
}

r.post('/:id/stock-in', async (req, res) => {
  const b = validate(z.object({
    quantity: qty, unit: text(20).min(1), supplier: text(120).optional(), reference: text(80).optional(), batch: text(80).optional(),
    expiresOn: z.coerce.date().optional(), unitCostCentavos: z.coerce.number().int().min(0).optional(), notes: text(300).optional(),
  }), req.body);
  const ing = await prisma.ingredient.findUnique({ where: { id: String(req.params.id) } });
  if (!ing) throw new AppError(404, 'INGREDIENT_NOT_FOUND', 'Ingredient not found.');
  if (b.unit !== ing.unit) throw new AppError(422, 'UNIT_MISMATCH', `${ing.name} is counted in ${ing.unit}, not ${b.unit}.`);
  await move(req, res, 'STOCK_IN', 1, { ...b, reason: 'Delivery' }, 'Stock received', async (tx) => {
    const data: Prisma.IngredientUpdateInput = {};
    if (b.supplier) data.supplier = b.supplier;
    if (b.expiresOn) data.expiresOn = b.expiresOn;
    if (b.batch) data.batchNote = b.batch;
    if (b.unitCostCentavos !== undefined) data.unitCostCentavos = b.unitCostCentavos;
    if (Object.keys(data).length) await tx.ingredient.update({ where: { id: String(req.params.id) }, data });
  });
});

// No orderId is accepted here on purpose: orders already deduct from their recipe, so a manual deduction
// tied to an order could double-count.
r.post('/:id/stock-out', async (req, res) => {
  const b = validate(z.object({ quantity: qty, reason: z.enum(['PREPARATION', 'OPERATIONAL_USAGE', 'MANUAL_ADJUSTMENT', 'OTHER']), notes: text(300).optional() }), req.body);
  await move(req, res, 'STOCK_OUT', -1, b, 'Usage recorded');
});

r.post('/:id/waste', async (req, res) => {
  const b = validate(z.object({
    quantity: qty, reason: z.enum(['EXPIRED', 'SPOILED', 'DAMAGED', 'PREPARATION_MISTAKE', 'OTHER']),
    notes: text(300).min(3, 'Please explain what happened'),
  }), req.body);
  await move(req, res, 'WASTE', -1, b, 'Waste recorded');
});

r.post('/:id/adjustments', requireAdmin, async (req, res) => {
  const b = validate(z.object({ newQuantity: nonneg, reason: text(300).min(5, 'A reason is required') }), req.body);
  const t = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id = ${String(req.params.id)} FOR UPDATE`;
    const ing = await tx.ingredient.findUnique({ where: { id: String(req.params.id) } });
    if (!ing) throw new AppError(404, 'INGREDIENT_NOT_FOUND', 'Ingredient not found.');
    const change = new Decimal(b.newQuantity).minus(ing.quantity.toString());
    if (change.isZero()) throw new AppError(422, 'NO_CHANGE', 'That is already the current quantity.');
    const rec = await applyMovement(tx, { ingredientId: ing.id, change, type: 'ADJUSTMENT', userId: req.user!.id, reason: b.reason });
    await audit(tx, req.user!.id, 'ADJUSTMENT', 'Ingredient', ing.id, { change: change.toString(), reason: b.reason });
    return rec;
  });
  kickOutbox();
  ok(res, t, 'Adjustment recorded', 201);
});
export default r;

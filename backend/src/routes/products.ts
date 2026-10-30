import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { ok, validate } from '../lib/http';
import { requireAdmin } from '../middleware/auth';
import { audit } from '../services/audit.service';

const r = Router();
const money = z.coerce.number().int().min(0).max(100_000_000);
const productBody = z.object({
  name: z.string().trim().min(1).max(80), description: z.string().trim().max(400).optional().nullable(),
  priceCentavos: money, category: z.string().trim().max(40).optional().nullable(), productType: z.enum(['SINGLE', 'COMBO', 'DRINK', 'OTHER']).default('SINGLE'),
  active: z.boolean().optional(), available: z.boolean().optional(),
});
    const full = { recipe: { include: { ingredient: { select: { name: true, unit: true, quantity: true } } } }, options: { where: { active: true }, include: { items: { include: { ingredient: { select: { name: true, unit: true } } } } } } } as const;
       // How many servings the CURRENT stock can make: the scarcest ingredient decides. null = no recipe.
   function servingsLeft(recipe: any[]): number | null {
     if (!recipe.length) return null;
     let min = Infinity;
     for (const r of recipe) {
       const have = Number(r.ingredient.quantity.toString());
       const need = Number(r.quantity.toString());
       const n = need > 0 && Number.isFinite(have) ? Math.floor(have / need) : 0;
       if (n < min) min = n;
     }
     return Math.max(0, min);
   }


r.get('/', async (req, res) => {
  const s = String(req.query.search ?? '').trim();
  const admin = req.user!.role === 'ADMIN';
  const items = await prisma.product.findMany({
    where: {
      ...(admin && req.query.includeInactive === 'true' ? {} : { active: true }),
      ...(req.query.category ? { category: String(req.query.category) } : {}),
      ...(req.query.available === 'true' ? { available: true } : {}),
      ...(s ? { name: { contains: s, mode: 'insensitive' as const } } : {}),
    },
    include: full, orderBy: { name: 'asc' },
  });
   ok(res, items.map((p) => ({ ...p, maxServings: servingsLeft(p.recipe) })));
});
r.get('/options', async (_req, res) => ok(res, await prisma.productOption.findMany({ include: { items: { include: { ingredient: { select: { name: true, unit: true } } } }, products: { select: { id: true, name: true } } }, orderBy: { name: 'asc' } })));

r.post('/', requireAdmin, async (req, res) => {
  const b = validate(productBody, req.body);
  const p = await prisma.$transaction(async (tx) => { const p = await tx.product.create({ data: b }); await audit(tx, req.user!.id, 'PRODUCT_CREATED', 'Product', p.id, { name: p.name, price: p.priceCentavos }); return p; });
  ok(res, p, 'Product added', 201);
});
r.get('/:id', async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: full });
  if (!p) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  ok(res, p);
});
r.patch('/:id', requireAdmin, async (req, res) => {
  const b = validate(productBody.partial(), req.body);
  const old = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
  if (!old) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  const p = await prisma.$transaction(async (tx) => {
    const p = await tx.product.update({ where: { id: old.id }, data: b });
    await audit(tx, req.user!.id, b.priceCentavos !== undefined && b.priceCentavos !== old.priceCentavos ? 'PRODUCT_PRICE_CHANGED' : 'PRODUCT_UPDATED', 'Product', p.id, { from: old.priceCentavos, to: p.priceCentavos });
    return p;
  });
  ok(res, p, 'Product saved');
});

r.get('/:id/recipes', async (req, res) => ok(res, await prisma.recipeItem.findMany({ where: { productId: String(req.params.id) }, include: { ingredient: { select: { name: true, unit: true } } } })));
// Replaces the whole recipe. Past orders keep their own snapshot, so history is unaffected.
r.post('/:id/recipes', requireAdmin, async (req, res) => {
  const b = validate(z.object({ items: z.array(z.object({ ingredientId: z.string().uuid(), quantity: z.coerce.number().positive().max(100000), notes: z.string().max(200).optional() })).min(1).max(40) }), req.body);
  if (new Set(b.items.map((i) => i.ingredientId)).size !== b.items.length) throw new AppError(422, 'DUPLICATE_INGREDIENT', 'Each ingredient can appear once per recipe.');
  const count = await prisma.ingredient.count({ where: { id: { in: b.items.map((i) => i.ingredientId) }, active: true } });
  if (count !== b.items.length) throw new AppError(422, 'INGREDIENT_NOT_FOUND', 'A recipe ingredient is missing or inactive.');
  await prisma.$transaction(async (tx) => {
    await tx.recipeItem.deleteMany({ where: { productId: String(req.params.id) } });
    await tx.recipeItem.createMany({ data: b.items.map((i) => ({ productId: String(req.params.id), ingredientId: i.ingredientId, quantity: i.quantity.toString(), notes: i.notes })) });
    await audit(tx, req.user!.id, 'RECIPE_CHANGED', 'Product', String(req.params.id), { items: b.items.length });
  });
  ok(res, null, 'Recipe saved');
});

r.post('/options', requireAdmin, async (req, res) => {
  const b = validate(z.object({
    name: z.string().trim().min(1).max(60), priceCentavos: money, active: z.boolean().optional(),
    productIds: z.array(z.string().uuid()).default([]),
    items: z.array(z.object({ ingredientId: z.string().uuid(), quantity: z.coerce.number().positive() })).default([]),
  }), req.body);
  const o = await prisma.$transaction(async (tx) => {
    const o = await tx.productOption.create({ data: { name: b.name, priceCentavos: b.priceCentavos, products: { connect: b.productIds.map((id) => ({ id })) }, items: { create: b.items.map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity.toString() })) } } });
    await audit(tx, req.user!.id, 'OPTION_CREATED', 'ProductOption', o.id, { name: o.name });
    return o;
  });
  ok(res, o, 'Add-on saved', 201);
});
r.patch('/options/:id', requireAdmin, async (req, res) => {
  const b = validate(z.object({ active: z.boolean().optional(), priceCentavos: money.optional() }), req.body);
  ok(res, await prisma.productOption.update({ where: { id: String(req.params.id) }, data: b }), 'Add-on saved');
});

// Image upload: type and size are checked, and the file signature is verified (not just the extension).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const sig = (b: Buffer): 'jpg' | 'png' | 'webp' | null =>
  b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'jpg' :
  b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png' :
  b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;

r.post('/:id/image', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) throw new AppError(422, 'NO_FILE', 'Choose an image to upload.');
  const ext = sig(req.file.buffer);
  if (!ext) throw new AppError(422, 'BAD_FILE_TYPE', 'Only JPG, PNG or WebP images are allowed.');
  const p = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
  if (!p) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(env.UPLOAD_DIR, name), req.file.buffer);
  removeFile(p.imageUrl);
  const u = await prisma.product.update({ where: { id: p.id }, data: { imageUrl: `${env.BACKEND_URL}/uploads/${name}` } });
  await audit(prisma, req.user!.id, 'PRODUCT_IMAGE_SET', 'Product', p.id);
  ok(res, u, 'Image saved');
});
r.delete('/:id/image', requireAdmin, async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
  if (!p) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  removeFile(p.imageUrl);
  ok(res, await prisma.product.update({ where: { id: p.id }, data: { imageUrl: null } }), 'Image removed');
});
function removeFile(url?: string | null) {
  if (!url) return;
  const f = path.basename(url);
  try { fs.unlinkSync(path.join(env.UPLOAD_DIR, f)); } catch { /* already gone */ }
}
// PASTE this block into backend\src\routes\products.ts, just ABOVE the line:  export default r;
// (all names used here - prisma, AppError, ok, requireAdmin, audit, removeFile - already exist in that file)

// Real delete, only for a product that has NEVER been sold. Anything that appears in an order stays,
// so sales history, receipts and reports can never lose a product name or price.
r.delete('/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  const inUse = () => new AppError(409, 'PRODUCT_IN_USE', `${p.name} is part of past orders, so it cannot be deleted. Hide it instead (Edit, untick Active) to keep the sales history.`);
  if ((await prisma.orderItem.count({ where: { productId: id } })) > 0) throw inUse();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
      await audit(tx, req.user!.id, 'PRODUCT_DELETED', 'Product', id, { name: p.name });
    });
  } catch (e: any) {
    if (e?.code === 'P2003') throw inUse(); // an order was placed at the same moment; the database refuses the delete
    throw e;
  }
  removeFile(p.imageUrl);
  ok(res, null, 'Product deleted');
});
export default r;

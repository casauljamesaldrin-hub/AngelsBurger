import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { AppError } from '../lib/errors';
import { ok, validate } from '../lib/http';
import { requireAdmin } from '../middleware/auth';
import { audit } from '../services/audit.service';

const r = Router();

const field = (max: number) => z.string().trim().max(max).nullable().optional();
const email = z.union([z.string().trim().email().max(120), z.literal('')]).nullable().optional();
const supplierBody = z.object({
  name: z.string().trim().min(1).max(80),
  contactName: field(80),
  phone: field(40),
  email,
  address: field(200),
  active: z.boolean().optional(),
});
// Empty strings are saved as "nothing"; fields that were not sent are left alone.
const nul = <T>(v: T | undefined) => (v === undefined ? undefined : v || null);

async function assertNameFree(name: string, exceptId?: string) {
  const clash = await prisma.supplier.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (clash) throw new AppError(409, 'SUPPLIER_EXISTS', `A supplier named "${clash.name}" already exists.`);
}

r.get('/', async (req, res) => {
  const admin = req.user!.role === 'ADMIN';
  const items = await prisma.supplier.findMany({
    where: admin && req.query.includeInactive === 'true' ? {} : { active: true },
    orderBy: { name: 'asc' },
  });
  ok(res, items);
});

r.post('/', requireAdmin, async (req, res) => {
  const b = validate(supplierBody, req.body);
  await assertNameFree(b.name);
  const s = await prisma.$transaction(async (tx) => {
    const s = await tx.supplier.create({
      data: { name: b.name, contactName: nul(b.contactName), phone: nul(b.phone), email: nul(b.email), address: nul(b.address) },
    });
    await audit(tx, req.user!.id, 'SUPPLIER_CREATED', 'Supplier', s.id, { name: s.name });
    return s;
  });
  ok(res, s, 'Supplier added', 201);
});

r.patch('/:id', requireAdmin, async (req, res) => {
  const b = validate(supplierBody.partial(), req.body);
  const old = await prisma.supplier.findUnique({ where: { id: String(req.params.id) } });
  if (!old) throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found.');
  if (b.name !== undefined) await assertNameFree(b.name, old.id);
  const s = await prisma.$transaction(async (tx) => {
    const s = await tx.supplier.update({
      where: { id: old.id },
      data: {
        ...(b.name !== undefined ? { name: b.name } : {}),
        contactName: nul(b.contactName),
        phone: nul(b.phone),
        email: nul(b.email),
        address: nul(b.address),
        ...(b.active !== undefined ? { active: b.active } : {}),
      },
    });
    await audit(tx, req.user!.id, b.active !== undefined && b.active !== old.active ? (b.active ? 'SUPPLIER_RESTORED' : 'SUPPLIER_DEACTIVATED') : 'SUPPLIER_UPDATED', 'Supplier', s.id, { name: s.name });
    return s;
  });
  ok(res, s, 'Supplier saved');
});

export default r;
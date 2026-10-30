import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { ok, pageParams, validate } from '../lib/http';
import { password } from './auth';
import { audit } from '../services/audit.service';
import { emailConfigured, missingEmailConfig, sendEmail } from '../services/email.service';
import { testEmail } from '../services/email.templates';
import { processOutbox } from '../services/notification.service';

export const users = Router();
const safe = { id: true, email: true, name: true, role: true, active: true, notifyLowStock: true, notifyOutOfStock: true, notifyDailySummary: true, createdAt: true } as const;

users.get('/', async (_req, res) => ok(res, await prisma.user.findMany({ select: safe, orderBy: { name: 'asc' } })));
users.post('/', async (req, res) => {
  const b = validate(z.object({ email: z.string().email(), name: z.string().trim().min(1).max(80), password, role: z.enum(['ADMIN', 'STAFF']).default('STAFF') }), req.body);
  const u = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: b.email.toLowerCase(), name: b.name, role: b.role, passwordHash: await bcrypt.hash(b.password, 12) }, select: safe });
    await audit(tx, req.user!.id, 'USER_CREATED', 'User', u.id, { role: u.role });
    return u;
  });
  ok(res, u, 'Account created', 201);
});
users.patch('/:id', async (req, res) => {
  const b = validate(z.object({ name: z.string().trim().min(1).max(80).optional(), role: z.enum(['ADMIN', 'STAFF']).optional(), active: z.boolean().optional(), notifyLowStock: z.boolean().optional(), notifyOutOfStock: z.boolean().optional(), notifyDailySummary: z.boolean().optional() }), req.body);
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
  const losingAdmin = target.role === 'ADMIN' && (b.active === false || b.role === 'STAFF');
  if (losingAdmin) {
    if (target.id === req.user!.id) throw new AppError(409, 'SELF_LOCKOUT', 'You cannot deactivate or demote your own account.');
    const others = await prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: target.id } } });
    if (!others) throw new AppError(409, 'LAST_ADMIN', 'At least one active admin is required.');
  }
  const u = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: target.id }, data: { ...b, ...(b.active === false || b.role ? { tokenVersion: { increment: 1 } } : {}) }, select: safe });
    await audit(tx, req.user!.id, b.active === false ? 'USER_DEACTIVATED' : 'USER_UPDATED', 'User', u.id, { fields: Object.keys(b) });
    return u;
  });
  ok(res, u, 'Account saved');
});

export const email = Router();
email.get('/status', (_req, res) => ok(res, { configured: emailConfigured(), missing: missingEmailConfig(), senderEmail: process.env.BREVO_SENDER_EMAIL || null }));
email.post('/test', async (req, res) => {
  const b = validate(z.object({ userId: z.string().uuid().optional() }), req.body ?? {});
  const target = b.userId ? await prisma.user.findFirst({ where: { id: b.userId, active: true } }) : await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'Choose an active user; test emails only go to registered accounts.');
  const mail = testEmail(req.user!.name);
  const r = await sendEmail({ to: target.email, ...mail });
  await prisma.emailNotification.create({ data: { type: 'TEST', recipient: target.email, subject: mail.subject, userId: target.id, attempts: 1, lastAttemptAt: new Date(), status: r.ok ? 'ACCEPTED' : 'FAILED', providerMessageId: r.ok ? r.messageId : undefined, error: r.ok ? undefined : r.code } });
  if (!r.ok) throw new AppError(r.code === 'EMAIL_NOT_CONFIGURED' ? 503 : 502, r.code, r.message);
  ok(res, { messageId: r.messageId }, `Brevo accepted the email for ${target.email}. Check that inbox (and spam) to confirm arrival.`);
});
email.get('/notifications', async (req, res) => {
  const { page, pageSize, skip } = pageParams(req.query);
  const [items, total] = await Promise.all([
    prisma.emailNotification.findMany({ orderBy: { createdAt: 'desc' }, skip, take: pageSize, select: { id: true, type: true, recipient: true, subject: true, status: true, attempts: true, providerMessageId: true, error: true, createdAt: true, lastAttemptAt: true } }),
    prisma.emailNotification.count(),
  ]);
  ok(res, { items, total, page, pageSize });
});
email.post('/process', async (_req, res) => ok(res, await processOutbox(), 'Outbox processed'));

export const audits = Router();
audits.get('/', async (req, res) => {
  const { page, pageSize, skip } = pageParams(req.query);
  const [items, total] = await Promise.all([prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take: pageSize, include: { actor: { select: { name: true } } } }), prisma.auditLog.count()]);
  ok(res, { items, total, page, pageSize });
});

export const settings = Router();
const DEFAULTS = { storeName: 'Angels Burger', units: ['pcs', 'pack', 'bottle', 'g', 'kg', 'ml', 'L'] };
settings.get('/', async (_req, res) => {
  const s = await prisma.setting.findUnique({ where: { key: 'app' } });
  ok(res, { ...DEFAULTS, ...((s?.value as object) ?? {}) });
});
settings.put('/', async (req, res) => {
  const b = validate(z.object({ storeName: z.string().trim().min(1).max(80), units: z.array(z.string().trim().min(1).max(20)).min(1).max(30) }), req.body);
  await prisma.setting.upsert({ where: { key: 'app' }, update: { value: b }, create: { key: 'app', value: b } });
  await audit(prisma, req.user!.id, 'SETTINGS_CHANGED', 'Setting', 'app');
  ok(res, b, 'Settings saved');
});

export const jobs = Router();
import { safeEqual } from '../lib/tokens';
import { dayRange, todayManila } from '../lib/time';
import { periodStats, stockAlerts } from '../services/stats.service';
import { dailySummaryEmail } from '../services/email.templates';
import { enqueueEmail } from '../services/notification.service';
import { pesos } from '../lib/format';

function jobAuth(req: any) {
  const given = String(req.get('x-job-secret') ?? '');
  if (!env.JOB_SECRET || !safeEqual(given, env.JOB_SECRET)) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid job secret.');
}
// Call from a scheduler (Railway cron, GitHub Actions, cron-job.org). Safe to run twice: dedupe key is per day + recipient.
jobs.post('/daily-summary', async (req, res) => {
  jobAuth(req);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? '')) ? String(req.query.date) : todayManila();
  const { from, to } = dayRange(date);
  const [s, alerts, recipients] = await Promise.all([periodStats(from, to), stockAlerts(), prisma.user.findMany({ where: { active: true, notifyDailySummary: true } })]);
  const mail = dailySummaryEmail({
    date, orders: s.completedOrders, revenue: pesos(s.revenueCentavos), top: s.topProducts,
    restock: alerts.map((a) => ({ name: a.name, quantity: a.quantity, unit: a.unit })), waste: s.waste, link: `${env.FRONTEND_URL}/`,
  });
  let queued = 0;
  for (const u of recipients) if (await enqueueEmail(prisma, { type: 'DAILY_SUMMARY', recipient: u.email, ...mail, dedupeKey: `daily:${date}:${u.id}`, userId: u.id })) queued++;
  ok(res, { date, recipients: recipients.length, queued, ...(await processOutbox()) }, 'Daily summary processed');
});
jobs.post('/process-outbox', async (req, res) => { jobAuth(req); ok(res, await processOutbox(), 'Outbox processed'); });

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { ok, validate } from '../lib/http';
import { newToken, hashToken } from '../lib/tokens';
import { COOKIE, cookieOptions, requireAuth, signSession } from '../middleware/auth';
import { audit } from '../services/audit.service';
import { sendEmail } from '../services/email.service';
import { passwordResetEmail } from '../services/email.templates';

export const password = z.string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/^\S+$/, 'Password must not contain spaces')
  .regex(/[A-Za-z]/, 'Password needs a letter')
  .regex(/\d/, 'Password needs a number');

const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in 15 minutes.' } } });
const forgotLimit = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many reset requests. Try again later.' } } });

const DUMMY = bcrypt.hashSync('not-a-real-password', 10);
const RESET_MINUTES = 30;
const r = Router();

r.post('/login', loginLimit, async (req, res) => {
  const b = validate(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const u = await prisma.user.findUnique({ where: { email: b.email.toLowerCase() } });
  const good = await bcrypt.compare(b.password, u?.passwordHash ?? DUMMY);
  if (!u || !good) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  if (!u.active) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is deactivated. Ask an admin.');
  res.cookie(COOKIE, signSession(u.id, u.tokenVersion), cookieOptions);
  await audit(prisma, u.id, 'LOGIN', 'User', u.id);
  ok(res, { id: u.id, email: u.email, name: u.name, role: u.role }, 'Signed in');
});

r.post('/logout', (_req, res) => { res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined }); ok(res, null, 'Signed out'); });
r.get('/me', requireAuth, (req, res) => ok(res, req.user));

r.post('/forgot-password', forgotLimit, async (req, res) => {
  const { email } = validate(z.object({ email: z.string().email() }), req.body);
  const generic = 'If that email belongs to an account, a reset link is on its way.';
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (u && u.active) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: u.id, usedAt: null } });
    const { token, hash } = newToken();
    await prisma.passwordResetToken.create({ data: { userId: u.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) } });
    const mail = passwordResetEmail(u.name, `${env.FRONTEND_URL}/reset-password?token=${token}`, RESET_MINUTES);
    // Sent directly (not via the outbox) so the raw token is never stored in the database.
    const result = await sendEmail({ to: u.email, ...mail });
    await prisma.emailNotification.create({ data: {
      type: 'PASSWORD_RESET', recipient: u.email, subject: mail.subject, userId: u.id, attempts: 1, lastAttemptAt: new Date(),
      status: result.ok ? 'ACCEPTED' : 'FAILED', providerMessageId: result.ok ? result.messageId : undefined, error: result.ok ? undefined : result.code,
    } });
  }
  ok(res, null, generic); // same response whether or not the account exists
});

r.post('/reset-password', forgotLimit, async (req, res) => {
  const b = validate(z.object({ token: z.string().min(20), password }), req.body);
  const t = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(b.token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) throw new AppError(400, 'INVALID_TOKEN', 'This reset link is invalid or expired. Request a new one.');
  const passwordHash = await bcrypt.hash(b.password, 12);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new AppError(400, 'INVALID_TOKEN', 'This reset link was already used.');
    await tx.user.update({ where: { id: t.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } }); // signs out old sessions
    await audit(tx, t.userId, 'PASSWORD_RESET', 'User', t.userId);
  });
  ok(res, null, 'Password updated. You can sign in now.');
});
export default r;

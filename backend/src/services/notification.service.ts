import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/db';
import { sendEmail } from './email.service';

type Db = PrismaClient | Prisma.TransactionClient;
const MAX_ATTEMPTS = 3;

/** Queue an email in the outbox. dedupeKey makes repeated enqueues harmless. */
export async function enqueueEmail(db: Db, e: { type: string; recipient: string; subject: string; html: string; text: string; dedupeKey?: string; userId?: string; ingredientId?: string }) {
  if (e.dedupeKey) {
    const exists = await db.emailNotification.findUnique({ where: { dedupeKey: e.dedupeKey } });
    if (exists) return null;
  }
  return db.emailNotification.create({ data: e });
}

/** Sends pending/retrying outbox rows. Status ACCEPTED means Brevo accepted it, not that it reached an inbox. */
export async function processOutbox(limit = 20) {
  const rows = await prisma.emailNotification.findMany({
    where: { status: { in: ['PENDING', 'RETRYING'] }, attempts: { lt: MAX_ATTEMPTS }, html: { not: null } },
    orderBy: { createdAt: 'asc' }, take: limit,
  });
  let accepted = 0, failed = 0;
  for (const row of rows) {
    const r = await sendEmail({ to: row.recipient, subject: row.subject, html: row.html!, text: row.text ?? '' });
    const attempts = row.attempts + 1;
    if (r.ok) {
      accepted++;
      await prisma.emailNotification.update({ where: { id: row.id }, data: { status: 'ACCEPTED', attempts, providerMessageId: r.messageId, lastAttemptAt: new Date(), error: null } });
    } else {
      failed++;
      const final = !r.retryable || attempts >= MAX_ATTEMPTS;
      await prisma.emailNotification.update({ where: { id: row.id }, data: { status: final ? 'FAILED' : 'RETRYING', attempts, lastAttemptAt: new Date(), error: r.code } });
    }
  }
  return { processed: rows.length, accepted, failed };
}

/** Fire-and-forget after a commit. Never throws into the request. */
export const kickOutbox = () => { processOutbox().catch((e) => console.error('[outbox]', e?.message)); };

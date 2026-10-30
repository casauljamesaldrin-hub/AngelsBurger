import { Prisma, PrismaClient } from '@prisma/client';
type Db = PrismaClient | Prisma.TransactionClient;
export const audit = (db: Db, actorId: string | null, action: string, entity: string, entityId?: string, details?: Prisma.InputJsonValue) =>
  db.auditLog.create({ data: { actorId, action, entity, entityId, details } });

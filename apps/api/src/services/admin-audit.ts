import { prisma } from '@jdm/db';
import type { AdminAuditAction } from '@jdm/shared/admin';
import { Prisma } from '@prisma/client';

export type RecordAuditInput = {
  actorId: string;
  action: AdminAuditAction;
  entityType: 'event' | 'tier' | 'ticket' | 'extra' | 'ticket_extra_item' | 'user' | 'product_type';
  entityId: string;
  metadata?: Record<string, unknown>;
};

export const recordAudit = async (input: RecordAuditInput): Promise<void> => {
  await prisma.adminAudit.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
};

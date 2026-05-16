import { prisma } from '@jdm/db';
import type { AdminAuditAction } from '@jdm/shared/admin';
import { Prisma } from '@prisma/client';

export type RecordAuditInput = {
  actorId: string;
  action: AdminAuditAction;
  entityType:
    | 'event'
    | 'tier'
    | 'ticket'
    | 'extra'
    | 'ticket_extra_item'
    | 'user'
    | 'store_collection'
    | 'store_settings'
    | 'general_settings'
    | 'product'
    | 'variant'
    | 'product_type'
    | 'order'
    | 'pickup_voucher'
    | 'support_ticket'
    | 'feed_post'
    | 'feed_comment'
    | 'report'
    | 'feed_ban'
    | 'retention_run'
    | 'dsr';
  entityId: string;
  metadata?: Record<string, unknown>;
};

type AuditClient = Pick<typeof prisma, 'adminAudit'> | Prisma.TransactionClient;

export const recordAudit = async (
  input: RecordAuditInput,
  client: AuditClient = prisma,
): Promise<void> => {
  await client.adminAudit.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
};

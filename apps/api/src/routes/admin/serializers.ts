import type { TicketTier as DbTier } from '@prisma/client';

export const serializeAdminTier = (t: DbTier) => ({
  id: t.id,
  name: t.name,
  priceCents: t.priceCents,
  currency: t.currency,
  quantityTotal: t.quantityTotal,
  quantitySold: t.quantitySold,
  remainingCapacity: Math.max(0, t.quantityTotal - t.quantitySold),
  salesOpenAt: t.salesOpenAt?.toISOString() ?? null,
  salesCloseAt: t.salesCloseAt?.toISOString() ?? null,
  sortOrder: t.sortOrder,
});

import type {
  ProductType as DbProductType,
  TicketExtra as DbTicketExtra,
  TicketTier as DbTier,
} from '@prisma/client';

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
  requiresCar: t.requiresCar,
});

export const serializeAdminProductType = (p: DbProductType, productCount: number) => ({
  id: p.id,
  name: p.name,
  sortOrder: p.sortOrder,
  productCount,
  createdAt: p.createdAt.toISOString(),
});

export const serializeAdminExtra = (e: DbTicketExtra) => ({
  id: e.id,
  eventId: e.eventId,
  name: e.name,
  description: e.description,
  priceCents: e.priceCents,
  currency: e.currency,
  quantityTotal: e.quantityTotal,
  quantitySold: e.quantitySold,
  active: e.active,
  sortOrder: e.sortOrder,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});

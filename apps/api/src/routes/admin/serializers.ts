import type {
  StoreSettings as DbStoreSettings,
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

export const serializeAdminStoreSettings = (s: DbStoreSettings) => ({
  id: s.id,
  defaultShippingFeeCents: s.defaultShippingFeeCents,
  lowStockThreshold: s.lowStockThreshold,
  pickupDisplayLabel: s.pickupDisplayLabel,
  supportPhone: s.supportPhone,
  updatedAt: s.updatedAt.toISOString(),
});

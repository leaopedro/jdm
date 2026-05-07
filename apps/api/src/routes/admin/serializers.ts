import type {
  Collection as DbCollection,
  Product as DbProduct,
  ProductType as DbProductType,
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

export const serializeAdminCollection = (
  c: DbCollection,
  productCount: number,
): {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
} => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  description: c.description,
  active: c.active,
  sortOrder: c.sortOrder,
  productCount,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

export const serializeAdminCollectionProduct = (
  p: Pick<DbProduct, 'id' | 'slug' | 'title' | 'status'>,
  sortOrder: number,
): {
  productId: string;
  sortOrder: number;
  title: string;
  slug: string;
  status: DbProduct['status'];
} => ({
  productId: p.id,
  sortOrder,
  title: p.title,
  slug: p.slug,
  status: p.status,
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

export const serializeAdminStoreSettings = (s: DbStoreSettings) => ({
  id: s.id,
  defaultShippingFeeCents: s.defaultShippingFeeCents,
  lowStockThreshold: s.lowStockThreshold,
  pickupDisplayLabel: s.pickupDisplayLabel,
  supportPhone: s.supportPhone,
  updatedAt: s.updatedAt.toISOString(),
});

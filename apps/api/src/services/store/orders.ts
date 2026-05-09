import { prisma } from '@jdm/db';
import {
  type AdminStoreOrderAuditEntry,
  type AdminStoreOrderDetail,
  type AdminStoreOrderItem,
  type AdminStoreOrderListResponse,
  type AdminStoreOrderQueueFilter,
  type AdminStoreOrderQueueTotals,
  type AdminStoreOrderRow,
  adminAuditActionSchema,
} from '@jdm/shared/admin';
import { type AdminStoreFulfillmentUpdate, type StoreFulfillmentStatus } from '@jdm/shared/store';
import type { OrderKind, Prisma } from '@prisma/client';

import { recordAudit } from '../admin-audit.js';

const ORDER_KINDS: OrderKind[] = ['product', 'mixed'];

const SHIP_TRANSITIONS: Record<StoreFulfillmentStatus, StoreFulfillmentStatus[]> = {
  unfulfilled: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  pickup_ready: [],
  picked_up: [],
  cancelled: [],
};

const PICKUP_TRANSITIONS: Record<StoreFulfillmentStatus, StoreFulfillmentStatus[]> = {
  unfulfilled: ['pickup_ready', 'cancelled'],
  pickup_ready: ['picked_up', 'cancelled'],
  picked_up: [],
  packed: [],
  shipped: [],
  delivered: [],
  cancelled: [],
};

export class OrderNotFoundError extends Error {
  constructor(id: string) {
    super(`order ${id} not found`);
    this.name = 'OrderNotFoundError';
  }
}

export class OrderNotEligibleError extends Error {
  constructor(id: string, reason: string) {
    super(`order ${id} not eligible: ${reason}`);
    this.name = 'OrderNotEligibleError';
  }
}

export class FulfillmentTransitionError extends Error {
  constructor(
    public readonly from: StoreFulfillmentStatus,
    public readonly to: StoreFulfillmentStatus,
    public readonly method: 'ship' | 'pickup',
  ) {
    super(`invalid fulfillment transition ${from} → ${to} for ${method}`);
    this.name = 'FulfillmentTransitionError';
  }
}

export const isAllowedFulfillmentTransition = (
  from: StoreFulfillmentStatus,
  to: StoreFulfillmentStatus,
  method: 'ship' | 'pickup',
): boolean => {
  if (from === to) return false;
  const table = method === 'ship' ? SHIP_TRANSITIONS : PICKUP_TRANSITIONS;
  return table[from].includes(to);
};

const FILTER_TO_STATUSES: Record<
  Exclude<AdminStoreOrderQueueFilter, 'all' | 'open'>,
  StoreFulfillmentStatus[]
> = {
  unfulfilled: ['unfulfilled'],
  packed: ['packed'],
  shipped: ['shipped'],
  delivered: ['delivered'],
  pickup_ready: ['pickup_ready'],
  picked_up: ['picked_up'],
  cancelled: ['cancelled'],
};

const TERMINAL_STATUSES: StoreFulfillmentStatus[] = ['delivered', 'picked_up', 'cancelled'];

const trackingFromMetadata = (metadata: Prisma.JsonValue | null): string | null => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const tracking = (metadata as Record<string, unknown>).trackingCode;
  return typeof tracking === 'string' && tracking.trim() !== '' ? tracking : null;
};

const computeTotals = (
  rows: { fulfillmentStatus: StoreFulfillmentStatus }[],
): AdminStoreOrderQueueTotals => {
  const counts: AdminStoreOrderQueueTotals = {
    all: rows.length,
    open: 0,
    unfulfilled: 0,
    packed: 0,
    shipped: 0,
    delivered: 0,
    pickup_ready: 0,
    picked_up: 0,
    cancelled: 0,
  };
  for (const row of rows) {
    counts[row.fulfillmentStatus] += 1;
    if (!TERMINAL_STATUSES.includes(row.fulfillmentStatus)) counts.open += 1;
  }
  return counts;
};

type ListInput = {
  status?: AdminStoreOrderQueueFilter | undefined;
  kind?: 'all' | 'product' | 'mixed' | undefined;
  q?: string | undefined;
};

export const listAdminStoreOrders = async (
  input: ListInput,
): Promise<AdminStoreOrderListResponse> => {
  const kindFilter: OrderKind[] =
    input.kind === 'product' ? ['product'] : input.kind === 'mixed' ? ['mixed'] : ORDER_KINDS;

  const baseWhere: Prisma.OrderWhereInput = { kind: { in: kindFilter } };
  if (input.q) {
    const q = input.q;
    baseWhere.OR = [
      { id: { contains: q } },
      { providerRef: { contains: q, mode: 'insensitive' } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const allOrders = await prisma.order.findMany({
    where: baseWhere,
    select: { fulfillmentStatus: true },
  });
  const totals = computeTotals(allOrders);

  const filter = input.status ?? 'all';
  const filteredWhere: Prisma.OrderWhereInput = { ...baseWhere };
  if (filter === 'open') {
    filteredWhere.fulfillmentStatus = { notIn: TERMINAL_STATUSES };
  } else if (filter !== 'all') {
    filteredWhere.fulfillmentStatus = { in: FILTER_TO_STATUSES[filter] };
  }

  const orders = await prisma.order.findMany({
    where: filteredWhere,
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      kind: true,
      status: true,
      fulfillmentStatus: true,
      fulfillmentMethod: true,
      amountCents: true,
      shippingCents: true,
      currency: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,
      shippingAddressId: true,
      user: { select: { name: true, email: true } },
      _count: { select: { items: true } },
    },
  });

  const orderIds = orders.map((o) => o.id);
  const lastTracking = orderIds.length
    ? await prisma.adminAudit.findMany({
        where: {
          entityType: 'order',
          entityId: { in: orderIds },
          action: 'store.order.fulfillment_update',
        },
        orderBy: { createdAt: 'desc' },
        select: { entityId: true, metadata: true, createdAt: true },
      })
    : [];

  const trackingByOrder = new Map<string, string>();
  for (const audit of lastTracking) {
    if (trackingByOrder.has(audit.entityId)) continue;
    const tracking = trackingFromMetadata(audit.metadata);
    if (tracking) trackingByOrder.set(audit.entityId, tracking);
  }

  const items: AdminStoreOrderRow[] = orders.map((o) => ({
    id: o.id,
    shortId: o.id.slice(-8).toUpperCase(),
    kind: o.kind as 'product' | 'mixed',
    paymentStatus: o.status,
    fulfillmentStatus: o.fulfillmentStatus,
    fulfillmentMethod: o.fulfillmentMethod,
    amountCents: o.amountCents,
    shippingCents: o.shippingCents,
    currency: o.currency,
    itemCount: o._count.items,
    customerName: o.user.name,
    customerEmail: o.user.email,
    trackingCode: trackingByOrder.get(o.id) ?? null,
    hasShippingAddress: o.shippingAddressId !== null,
    paidAt: o.paidAt ? o.paidAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }));

  return { totals, items };
};

const pickupRefsFromNotes = (
  notes: string | null,
): { eventId: string | null; ticketId: string | null } => {
  if (!notes) return { eventId: null, ticketId: null };
  try {
    const parsed = JSON.parse(notes) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const eventId = typeof obj.pickupEventId === 'string' ? obj.pickupEventId : null;
      const ticketId = typeof obj.pickupTicketId === 'string' ? obj.pickupTicketId : null;
      return { eventId, ticketId };
    }
  } catch {
    // ignore
  }
  return { eventId: null, ticketId: null };
};

export const getAdminStoreOrderDetail = async (orderId: string): Promise<AdminStoreOrderDetail> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      shippingAddress: true,
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
              attributes: true,
              productId: true,
              product: { select: { title: true } },
            },
          },
          tier: { select: { name: true } },
          extra: { select: { name: true } },
        },
      },
    },
  });
  if (!order) throw new OrderNotFoundError(orderId);
  if (order.kind !== 'product' && order.kind !== 'mixed') {
    throw new OrderNotEligibleError(orderId, `kind ${order.kind} is not a store order`);
  }

  const audits = await prisma.adminAudit.findMany({
    where: { entityType: 'order', entityId: order.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const actorIds = Array.from(new Set(audits.map((a) => a.actorId)));
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const history: AdminStoreOrderAuditEntry[] = audits
    .map((a) => {
      const action = adminAuditActionSchema.safeParse(a.action);
      if (!action.success) return null;
      const actor = actorById.get(a.actorId) ?? null;
      const metadata =
        a.metadata && typeof a.metadata === 'object' && !Array.isArray(a.metadata)
          ? (a.metadata as Record<string, unknown>)
          : null;
      return {
        id: a.id,
        actorName: actor?.name ?? null,
        actorEmail: actor?.email ?? null,
        action: action.data,
        metadata,
        createdAt: a.createdAt.toISOString(),
      } satisfies AdminStoreOrderAuditEntry;
    })
    .filter((e): e is AdminStoreOrderAuditEntry => e !== null);

  const lastTracking = history.find(
    (h) =>
      h.action === 'store.order.fulfillment_update' &&
      h.metadata &&
      typeof h.metadata.trackingCode === 'string',
  )?.metadata?.trackingCode;
  const trackingCode =
    typeof lastTracking === 'string' && lastTracking.trim() !== '' ? lastTracking : null;

  const items: AdminStoreOrderItem[] = order.items.map((it) => {
    const attrs =
      it.variant && it.variant.attributes && typeof it.variant.attributes === 'object'
        ? Object.fromEntries(
            Object.entries(it.variant.attributes as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : null;
    return {
      id: it.id,
      kind: it.kind,
      variantId: it.variantId,
      productId: it.variant?.productId ?? null,
      productTitle: it.variant?.product.title ?? null,
      variantName: it.variant?.name ?? null,
      variantSku: it.variant?.sku ?? null,
      variantAttributes: attrs,
      tierId: it.tierId,
      tierName: it.tier?.name ?? null,
      extraId: it.extraId,
      extraLabel: it.extra?.name ?? null,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      subtotalCents: it.subtotalCents,
    };
  });

  const pickupRefs = pickupRefsFromNotes(order.notes);
  const pickupEventId = order.pickupEventId ?? pickupRefs.eventId;
  const pickupTicketId = order.pickupTicketId ?? pickupRefs.ticketId;
  const pickupEvent = pickupEventId
    ? await prisma.event.findUnique({
        where: { id: pickupEventId },
        select: { id: true, title: true },
      })
    : null;

  return {
    id: order.id,
    shortId: order.id.slice(-8).toUpperCase(),
    kind: order.kind,
    paymentStatus: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    fulfillmentMethod: order.fulfillmentMethod,
    provider: order.provider,
    providerRef: order.providerRef,
    notes: order.notes,
    amountCents: order.amountCents,
    shippingCents: order.shippingCents,
    currency: order.currency,
    itemCount: order.items.length,
    customerName: order.user.name,
    customerEmail: order.user.email,
    customer: { id: order.user.id, name: order.user.name, email: order.user.email },
    shippingAddress: order.shippingAddress
      ? {
          recipientName: order.shippingAddress.recipientName,
          line1: order.shippingAddress.line1,
          line2: order.shippingAddress.line2,
          number: order.shippingAddress.number,
          district: order.shippingAddress.district,
          city: order.shippingAddress.city,
          stateCode: order.shippingAddress.stateCode,
          postalCode: order.shippingAddress.postalCode,
          phone: order.shippingAddress.phone,
        }
      : null,
    pickupEventId,
    pickupEventTitle: pickupEvent?.title ?? null,
    pickupTicketId,
    items,
    history,
    trackingCode,
    hasShippingAddress: order.shippingAddressId !== null,
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
};

export type UpdateFulfillmentInput = AdminStoreFulfillmentUpdate & {
  actorId: string;
  orderId: string;
};

export const updateAdminStoreFulfillment = async (
  input: UpdateFulfillmentInput,
): Promise<AdminStoreOrderDetail> => {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      kind: true,
      status: true,
      fulfillmentStatus: true,
      fulfillmentMethod: true,
    },
  });
  if (!order) throw new OrderNotFoundError(input.orderId);
  if (order.kind !== 'product' && order.kind !== 'mixed') {
    throw new OrderNotEligibleError(input.orderId, `kind ${order.kind} is not a store order`);
  }
  if (order.status !== 'paid') {
    throw new OrderNotEligibleError(input.orderId, `payment status ${order.status} is not paid`);
  }
  if (
    !isAllowedFulfillmentTransition(order.fulfillmentStatus, input.status, order.fulfillmentMethod)
  ) {
    throw new FulfillmentTransitionError(
      order.fulfillmentStatus,
      input.status,
      order.fulfillmentMethod,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: input.status },
    });

    await recordAudit(
      {
        actorId: input.actorId,
        action: 'store.order.fulfillment_update',
        entityType: 'order',
        entityId: order.id,
        metadata: {
          from: order.fulfillmentStatus,
          to: input.status,
          method: order.fulfillmentMethod,
          trackingCode: input.trackingCode ?? null,
          note: input.note ?? null,
        },
      },
      tx,
    );
  });

  return getAdminStoreOrderDetail(order.id);
};

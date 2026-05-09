import { prisma } from '@jdm/db';
import { adminFinanceQuerySchema } from '@jdm/shared/admin';
import { Prisma, type OrderStatus, type PaymentMethod, type PaymentProvider } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

type FinanceOrderRecord = {
  id: string;
  eventId: string | null;
  amountCents: number;
  provider: PaymentProvider;
  method: PaymentMethod;
  status: OrderStatus;
  paidAt: Date | null;
  items: Array<{ subtotalCents: number }>;
  event: null | {
    id: string;
    title: string;
    startsAt: Date;
    city: string | null;
    stateCode: string | null;
  };
};

function buildWhere(query: unknown): Prisma.OrderWhereInput {
  const q = adminFinanceQuerySchema.parse(query);
  const where: Prisma.OrderWhereInput = {};

  if (q.statuses && q.statuses.length > 0) {
    where.status = { in: q.statuses };
  } else {
    where.status = { in: ['paid', 'refunded'] };
  }

  if (q.from || q.to) {
    where.paidAt = {};
    if (q.from) where.paidAt.gte = new Date(`${q.from}T00:00:00.000Z`);
    if (q.to) where.paidAt.lte = new Date(`${q.to}T23:59:59.999Z`);
  }

  if (q.provider) where.provider = q.provider;
  if (q.method) where.method = q.method;

  if (q.eventIds && q.eventIds.length > 0) {
    where.eventId = { in: q.eventIds };
  }

  if (q.search || q.city || q.stateCode) {
    where.event = {};
    if (q.search) {
      where.event.title = { contains: q.search, mode: 'insensitive' };
    }
    if (q.city) where.event.city = q.city;
    if (q.stateCode) where.event.stateCode = q.stateCode;
  }

  return where;
}

function getFinanceOrderRevenueCents(
  order: Pick<FinanceOrderRecord, 'amountCents' | 'items'>,
): number {
  if (order.items.length === 0) {
    return order.amountCents;
  }

  return order.items.reduce((sum, item) => sum + item.subtotalCents, 0);
}

async function findFinanceOrders(
  where: Prisma.OrderWhereInput,
  statuses: Array<'paid' | 'refunded'>,
): Promise<FinanceOrderRecord[]> {
  const orders = await prisma.order.findMany({
    where: {
      ...where,
      status: { in: statuses },
    },
    select: {
      id: true,
      eventId: true,
      amountCents: true,
      provider: true,
      method: true,
      status: true,
      paidAt: true,
      event: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          city: true,
          stateCode: true,
        },
      },
    },
  });

  const orderIds = orders.map((order) => order.id);
  const orderItems =
    orderIds.length > 0
      ? await prisma.$queryRaw<Array<{ orderId: string; subtotalCents: number }>>(Prisma.sql`
          SELECT "orderId", "subtotalCents"
          FROM "OrderItem"
          WHERE "orderId" IN (${Prisma.join(orderIds)})
        `)
      : [];

  const itemsByOrderId = new Map<string, Array<{ subtotalCents: number }>>();
  for (const item of orderItems) {
    const bucket = itemsByOrderId.get(item.orderId) ?? [];
    bucket.push({ subtotalCents: item.subtotalCents });
    itemsByOrderId.set(item.orderId, bucket);
  }

  return orders.map((order) => ({
    ...order,
    items: itemsByOrderId.get(order.id) ?? [],
  }));
}

// eslint-disable-next-line @typescript-eslint/require-await
export const adminFinanceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/finance/summary', async (request) => {
    const where = buildWhere(request.query);

    const [orders, ticketCount] = await Promise.all([
      findFinanceOrders(where, ['paid', 'refunded']),
      prisma.ticket.count({
        where: {
          order: where,
          status: { in: ['valid', 'used'] },
        },
      }),
    ]);

    let totalRevenueCents = 0;
    let refundedCents = 0;
    let orderCount = 0;
    let refundedCount = 0;

    for (const order of orders) {
      const revenueCents = getFinanceOrderRevenueCents(order);
      if (order.status === 'paid') {
        totalRevenueCents += revenueCents;
        orderCount += 1;
      } else {
        refundedCents += revenueCents;
        refundedCount += 1;
      }
    }

    const avgOrderCents = orderCount > 0 ? Math.round(totalRevenueCents / orderCount) : 0;

    return {
      totalRevenueCents,
      orderCount,
      avgOrderCents,
      ticketCount,
      refundedCents,
      refundedCount,
    };
  });

  app.get('/finance/by-event', async (request) => {
    const where = buildWhere(request.query);
    const whereWithEvent: Prisma.OrderWhereInput = { ...where, eventId: { not: null } };
    const orders = await findFinanceOrders(whereWithEvent, ['paid', 'refunded']);
    const buckets = new Map<
      string,
      {
        eventId: string;
        eventTitle: string;
        startsAt: string;
        city: string | null;
        stateCode: string | null;
        revenueCents: number;
        orderCount: number;
        ticketCount: number;
        refundedCents: number;
      }
    >();

    for (const order of orders) {
      if (!order.eventId || !order.event) {
        continue;
      }

      const bucket = buckets.get(order.eventId) ?? {
        eventId: order.eventId,
        eventTitle: order.event.title,
        startsAt: order.event.startsAt.toISOString(),
        city: order.event.city,
        stateCode: order.event.stateCode,
        revenueCents: 0,
        orderCount: 0,
        ticketCount: 0,
        refundedCents: 0,
      };

      const revenueCents = getFinanceOrderRevenueCents(order);
      if (order.status === 'paid') {
        bucket.revenueCents += revenueCents;
        bucket.orderCount += 1;
      } else {
        bucket.refundedCents += revenueCents;
      }

      buckets.set(order.eventId, bucket);
    }

    const eventIds = Array.from(buckets.keys());
    const ticketCounts = await prisma.ticket.groupBy({
      by: ['eventId'],
      where: {
        eventId: { in: eventIds },
        order: whereWithEvent,
        status: { in: ['valid', 'used'] },
      },
      _count: { id: true },
    });
    const ticketMap = new Map(ticketCounts.map((t) => [t.eventId, t._count?.id ?? 0]));

    const items = Array.from(buckets.values())
      .map((bucket) => ({
        ...bucket,
        ticketCount: ticketMap.get(bucket.eventId) ?? 0,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);

    return { items };
  });

  app.get('/finance/trends', async (request) => {
    const where = buildWhere(request.query);

    const orders = await findFinanceOrders(where, ['paid']);

    const buckets = new Map<string, { revenueCents: number; orderCount: number }>();
    for (const o of orders) {
      if (!o.paidAt) continue;
      const date = o.paidAt.toISOString().slice(0, 10);
      const bucket = buckets.get(date) ?? { revenueCents: 0, orderCount: 0 };
      bucket.revenueCents += getFinanceOrderRevenueCents(o);
      bucket.orderCount += 1;
      buckets.set(date, bucket);
    }

    const points = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    return { points };
  });

  app.get('/finance/payment-mix', async (request) => {
    const where = buildWhere(request.query);

    const orders = await findFinanceOrders(where, ['paid']);
    const buckets = new Map<
      string,
      {
        provider: 'stripe' | 'abacatepay';
        method: 'card' | 'pix';
        revenueCents: number;
        orderCount: number;
      }
    >();

    for (const order of orders) {
      const key = `${order.provider}:${order.method}`;
      const bucket = buckets.get(key) ?? {
        provider: order.provider,
        method: order.method,
        revenueCents: 0,
        orderCount: 0,
      };

      bucket.revenueCents += getFinanceOrderRevenueCents(order);
      bucket.orderCount += 1;
      buckets.set(key, bucket);
    }

    const items = Array.from(buckets.values());
    const totalRevenue = items.reduce((sum, item) => sum + item.revenueCents, 0);

    return {
      items: items.map((item) => ({
        ...item,
        percentage:
          totalRevenue > 0 ? Math.round((item.revenueCents / totalRevenue) * 10000) / 100 : 0,
      })),
    };
  });

  app.get('/finance/export', async (request, reply) => {
    const where = buildWhere(request.query);

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        amountCents: true,
        currency: true,
        method: true,
        provider: true,
        status: true,
        paidAt: true,
        createdAt: true,
        quantity: true,
        event: { select: { title: true, city: true, stateCode: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 10_000,
    });

    const header =
      'id,event,city,state,user_name,user_email,amount_cents,currency,method,provider,status,quantity,paid_at,created_at';
    const rows = orders.map((o) => {
      const cols = [
        o.id,
        csvEscape(o.event?.title ?? ''),
        csvEscape(o.event?.city ?? ''),
        o.event?.stateCode ?? '',
        csvEscape(o.user.name),
        csvEscape(o.user.email),
        o.amountCents,
        o.currency,
        o.method,
        o.provider,
        o.status,
        o.quantity,
        o.paidAt?.toISOString() ?? '',
        o.createdAt.toISOString(),
      ];
      return cols.join(',');
    });

    const csv = [header, ...rows].join('\n');
    void reply.header('content-type', 'text/csv; charset=utf-8');
    void reply.header('content-disposition', 'attachment; filename="finance-export.csv"');
    return csv;
  });
};

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

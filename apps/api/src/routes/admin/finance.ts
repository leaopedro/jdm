import { prisma } from '@jdm/db';
import { adminFinanceQuerySchema } from '@jdm/shared/admin';
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

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

// eslint-disable-next-line @typescript-eslint/require-await
export const adminFinanceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/finance/summary', async (request) => {
    const where = buildWhere(request.query);

    const [paidAgg, refundedAgg, ticketCount] = await Promise.all([
      prisma.order.aggregate({
        where: { ...where, status: 'paid' },
        _sum: { amountCents: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: { ...where, status: 'refunded' },
        _sum: { amountCents: true },
        _count: { id: true },
      }),
      prisma.ticket.count({
        where: {
          order: where,
          status: { in: ['valid', 'used'] },
        },
      }),
    ]);

    const totalRevenueCents = paidAgg._sum.amountCents ?? 0;
    const orderCount = paidAgg._count.id;
    const avgOrderCents = orderCount > 0 ? Math.round(totalRevenueCents / orderCount) : 0;

    return {
      totalRevenueCents,
      orderCount,
      avgOrderCents,
      ticketCount,
      refundedCents: refundedAgg._sum.amountCents ?? 0,
      refundedCount: refundedAgg._count.id,
    };
  });

  app.get('/finance/by-event', async (request) => {
    const where = buildWhere(request.query);

    const orders = await prisma.order.groupBy({
      by: ['eventId'],
      where: { ...where, status: 'paid' },
      _sum: { amountCents: true },
      _count: { id: true },
    });

    const refunds = await prisma.order.groupBy({
      by: ['eventId'],
      where: { ...where, status: 'refunded' },
      _sum: { amountCents: true },
    });

    const eventIds = orders.map((o) => o.eventId);
    const events = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, title: true, startsAt: true, city: true, stateCode: true },
    });
    const eventMap = new Map(events.map((e) => [e.id, e]));

    const refundMap = new Map(refunds.map((r) => [r.eventId, r._sum.amountCents ?? 0]));

    const ticketCounts = await prisma.ticket.groupBy({
      by: ['eventId'],
      where: {
        eventId: { in: eventIds },
        order: where,
        status: { in: ['valid', 'used'] },
      },
      _count: { id: true },
    });
    const ticketMap = new Map(ticketCounts.map((t) => [t.eventId, t._count.id]));

    const items = orders
      .map((o) => {
        const ev = eventMap.get(o.eventId);
        if (!ev) return null;
        return {
          eventId: o.eventId,
          eventTitle: ev.title,
          startsAt: ev.startsAt.toISOString(),
          city: ev.city,
          stateCode: ev.stateCode,
          revenueCents: o._sum.amountCents ?? 0,
          orderCount: o._count.id,
          ticketCount: ticketMap.get(o.eventId) ?? 0,
          refundedCents: refundMap.get(o.eventId) ?? 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.revenueCents - a!.revenueCents);

    return { items };
  });

  app.get('/finance/trends', async (request) => {
    const where = buildWhere(request.query);

    const orders = await prisma.order.findMany({
      where: { ...where, status: 'paid' },
      select: { paidAt: true, amountCents: true },
      orderBy: { paidAt: 'asc' },
    });

    const buckets = new Map<string, { revenueCents: number; orderCount: number }>();
    for (const o of orders) {
      if (!o.paidAt) continue;
      const date = o.paidAt.toISOString().slice(0, 10);
      const bucket = buckets.get(date) ?? { revenueCents: 0, orderCount: 0 };
      bucket.revenueCents += o.amountCents;
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

    const groups = await prisma.order.groupBy({
      by: ['provider', 'method'],
      where: { ...where, status: 'paid' },
      _sum: { amountCents: true },
      _count: { id: true },
    });

    const totalRevenue = groups.reduce((sum, g) => sum + (g._sum.amountCents ?? 0), 0);

    const items = groups.map((g) => ({
      provider: g.provider,
      method: g.method,
      revenueCents: g._sum.amountCents ?? 0,
      orderCount: g._count.id,
      percentage:
        totalRevenue > 0 ? Math.round(((g._sum.amountCents ?? 0) / totalRevenue) * 10000) / 100 : 0,
    }));

    return { items };
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
        csvEscape(o.event.title),
        csvEscape(o.event.city ?? ''),
        o.event.stateCode ?? '',
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

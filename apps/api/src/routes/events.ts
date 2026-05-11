import { prisma } from '@jdm/db';
import {
  eventDetailCommerceSchema,
  eventDetailPublicSchema,
  eventListQuerySchema,
  eventListResponseSchema,
  eventSummarySchema,
  ticketTierSchema,
} from '@jdm/shared/events';
import { eventExtraPublicSchema } from '@jdm/shared/extras';
import type {
  Event as DbEvent,
  Prisma,
  TicketExtra as DbExtra,
  TicketTier as DbTier,
} from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

import type { Uploads } from '../services/uploads/index.js';

const encodeCursor = (e: Pick<DbEvent, 'startsAt' | 'id'>): string =>
  Buffer.from(JSON.stringify({ s: e.startsAt.toISOString(), i: e.id })).toString('base64url');

const decodeCursor = (raw: string): { startsAt: Date; id: string } => {
  const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { s: string; i: string };
  return { startsAt: new Date(parsed.s), id: parsed.i };
};

const serializeSummary = (e: DbEvent, uploads: Uploads) =>
  eventSummarySchema.parse({
    id: e.id,
    slug: e.slug,
    title: e.title,
    coverUrl: e.coverObjectKey ? uploads.buildPublicUrl(e.coverObjectKey) : null,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    venueName: e.venueName,
    city: e.city,
    stateCode: e.stateCode,
    type: e.type,
    status: e.status,
  });

const serializeTier = (t: DbTier) =>
  ticketTierSchema.parse({
    id: t.id,
    name: t.name,
    priceCents: t.priceCents,
    currency: t.currency,
    quantityTotal: t.quantityTotal,
    remainingCapacity: Math.max(0, t.quantityTotal - t.quantitySold),
    salesOpenAt: t.salesOpenAt?.toISOString() ?? null,
    salesCloseAt: t.salesCloseAt?.toISOString() ?? null,
    sortOrder: t.sortOrder,
    requiresCar: t.requiresCar,
  });

const serializeExtra = (x: DbExtra) =>
  eventExtraPublicSchema.parse({
    id: x.id,
    name: x.name,
    description: x.description,
    priceCents: x.priceCents,
    currency: x.currency,
    quantityRemaining:
      x.quantityTotal != null ? Math.max(0, x.quantityTotal - x.quantitySold) : null,
    sortOrder: x.sortOrder,
  });

const serializePublicDetail = (e: DbEvent, uploads: Uploads) =>
  eventDetailPublicSchema.parse({
    id: e.id,
    slug: e.slug,
    title: e.title,
    coverUrl: e.coverObjectKey ? uploads.buildPublicUrl(e.coverObjectKey) : null,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    venueName: e.venueName,
    venueAddress: e.venueAddress,
    city: e.city,
    stateCode: e.stateCode,
    type: e.type,
    description: e.description,
    capacity: e.capacity,
    maxTicketsPerUser: e.maxTicketsPerUser,
  });

const serializeCommerceDetail = (
  e: DbEvent & { tiers: DbTier[]; extras: DbExtra[] },
  uploads: Uploads,
) =>
  eventDetailCommerceSchema.parse({
    id: e.id,
    slug: e.slug,
    title: e.title,
    coverUrl: e.coverObjectKey ? uploads.buildPublicUrl(e.coverObjectKey) : null,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    venueName: e.venueName,
    venueAddress: e.venueAddress,
    city: e.city,
    stateCode: e.stateCode,
    type: e.type,
    description: e.description,
    capacity: e.capacity,
    maxTicketsPerUser: e.maxTicketsPerUser,
    tiers: e.tiers
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(serializeTier),
    extras: e.extras
      .filter((x) => x.quantityTotal == null || x.quantitySold < x.quantityTotal)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(serializeExtra),
  });

// eslint-disable-next-line @typescript-eslint/require-await
export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get('/events', async (request, reply) => {
    const { window, type, stateCode, city, cursor, limit } = eventListQuerySchema.parse(
      request.query,
    );
    const now = new Date();

    const where: Prisma.EventWhereInput = { status: 'published' };
    if (type) where.type = type;
    if (stateCode) where.stateCode = stateCode;
    if (city) where.city = city;
    if (window === 'upcoming') where.endsAt = { gte: now };
    else if (window === 'past') where.endsAt = { lt: now };

    const asc = window !== 'past';
    const orderBy = [{ startsAt: asc ? 'asc' : 'desc' }, { id: asc ? 'asc' : 'desc' }] as const;

    if (cursor) {
      try {
        const { startsAt, id } = decodeCursor(cursor);
        const cmp = asc ? 'gt' : 'lt';
        where.OR = [
          { startsAt: { [cmp]: startsAt } } as Prisma.EventWhereInput,
          { startsAt, id: { [cmp]: id } } as Prisma.EventWhereInput,
        ];
      } catch {
        return reply.status(400).send({ error: 'BadRequest', message: 'invalid cursor' });
      }
    }

    const rows = await prisma.event.findMany({
      where,
      orderBy: [...orderBy],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return eventListResponseSchema.parse({
      items: page.map((e) => serializeSummary(e, app.uploads)),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    });
  });

  app.get('/events/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const event = await prisma.event.findFirst({
      where: { slug, status: 'published' },
    });
    if (!event) return reply.status(404).send({ error: 'NotFound' });
    return serializePublicDetail(event, app.uploads);
  });

  app.get('/events/by-id/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = await prisma.event.findFirst({
      where: { id, status: 'published' },
    });
    if (!event) return reply.status(404).send({ error: 'NotFound' });
    return serializePublicDetail(event, app.uploads);
  });

  app.get('/events/:slug/commerce', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const event = await prisma.event.findFirst({
      where: { slug, status: 'published' },
      include: {
        tiers: true,
        extras: { where: { active: true } },
      },
    });
    if (!event) return reply.status(404).send({ error: 'NotFound' });
    return serializeCommerceDetail(event, app.uploads);
  });

  app.get(
    '/events/by-id/:id/commerce',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const event = await prisma.event.findFirst({
        where: { id, status: 'published' },
        include: {
          tiers: true,
          extras: { where: { active: true } },
        },
      });
      if (!event) return reply.status(404).send({ error: 'NotFound' });
      return serializeCommerceDetail(event, app.uploads);
    },
  );
};

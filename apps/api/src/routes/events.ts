import { prisma } from '@jdm/db';
import {
  eventListQuerySchema,
  eventListResponseSchema,
  eventSummarySchema,
} from '@jdm/shared/events';
import type { Event as DbEvent } from '@prisma/client';
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
  });

// eslint-disable-next-line @typescript-eslint/require-await
export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get('/events', async (request, reply) => {
    const parsed = eventListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'BadRequest', issues: parsed.error.flatten() });
    }
    const { window, type, stateCode, city, cursor, limit } = parsed.data;
    const now = new Date();

    const where: Record<string, unknown> = { status: 'published' };
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
        where.OR = [{ startsAt: { [cmp]: startsAt } }, { startsAt, id: { [cmp]: id } }];
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
};

import { prisma } from '@jdm/db';
import {
  adminEventCreateSchema,
  adminEventDetailSchema,
  adminEventUpdateSchema,
} from '@jdm/shared/admin';
import type { Event as DbEvent, TicketTier as DbTier, Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../../plugins/auth.js';
import { recordAudit } from '../../services/admin-audit.js';
import type { Uploads } from '../../services/uploads/index.js';

import { serializeAdminTier } from './serializers.js';

const serializeDetail = (e: DbEvent & { tiers: DbTier[] }, uploads: Uploads) =>
  adminEventDetailSchema.parse({
    id: e.id,
    slug: e.slug,
    title: e.title,
    coverUrl: e.coverObjectKey ? uploads.buildPublicUrl(e.coverObjectKey) : null,
    coverObjectKey: e.coverObjectKey,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    venueName: e.venueName,
    venueAddress: e.venueAddress,
    lat: e.lat,
    lng: e.lng,
    city: e.city,
    stateCode: e.stateCode,
    type: e.type,
    description: e.description,
    capacity: e.capacity,
    status: e.status,
    publishedAt: e.publishedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    tiers: e.tiers
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(serializeAdminTier),
  });

// eslint-disable-next-line @typescript-eslint/require-await
export const adminEventRoutes: FastifyPluginAsync = async (app) => {
  app.post('/events', async (request, reply) => {
    const { sub } = requireUser(request);
    const input = adminEventCreateSchema.parse(request.body);
    try {
      const event = await prisma.event.create({
        data: {
          slug: input.slug,
          title: input.title,
          description: input.description,
          coverObjectKey: input.coverObjectKey,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          venueName: input.venueName,
          venueAddress: input.venueAddress,
          lat: input.lat,
          lng: input.lng,
          city: input.city,
          stateCode: input.stateCode,
          type: input.type,
          capacity: input.capacity,
          status: 'draft',
        },
        include: { tiers: true },
      });
      await recordAudit({
        actorId: sub,
        action: 'event.create',
        entityType: 'event',
        entityId: event.id,
        metadata: { slug: event.slug },
      });
      return reply.status(201).send(serializeDetail(event, app.uploads));
    } catch (e) {
      const err = e as Prisma.PrismaClientKnownRequestError;
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: 'Conflict', message: 'slug already exists' });
      }
      throw e;
    }
  });

  app.get('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = await prisma.event.findUnique({ where: { id }, include: { tiers: true } });
    if (!event) return reply.status(404).send({ error: 'NotFound' });
    return serializeDetail(event, app.uploads);
  });

  app.patch('/events/:id', async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };
    const input = adminEventUpdateSchema.parse(request.body);

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'NotFound' });

    const data: Prisma.EventUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.coverObjectKey !== undefined) data.coverObjectKey = input.coverObjectKey;
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = new Date(input.endsAt);
    if (input.venueName !== undefined) data.venueName = input.venueName;
    if (input.venueAddress !== undefined) data.venueAddress = input.venueAddress;
    if (input.lat !== undefined) data.lat = input.lat;
    if (input.lng !== undefined) data.lng = input.lng;
    if (input.city !== undefined) data.city = input.city;
    if (input.stateCode !== undefined) data.stateCode = input.stateCode;
    if (input.type !== undefined) data.type = input.type;
    if (input.capacity !== undefined) data.capacity = input.capacity;

    const updated = await prisma.event.update({
      where: { id },
      data,
      include: { tiers: true },
    });
    await recordAudit({
      actorId: sub,
      action: 'event.update',
      entityType: 'event',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeDetail(updated, app.uploads);
  });

  app.post('/events/:id/publish', async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };
    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'NotFound' });
    if (existing.status === 'published') {
      return reply.status(409).send({ error: 'Conflict', message: 'already published' });
    }
    if (existing.status === 'cancelled') {
      return reply
        .status(409)
        .send({ error: 'Conflict', message: 'cancelled events cannot be re-published' });
    }
    const updated = await prisma.event.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: existing.publishedAt ?? new Date(),
      },
      include: { tiers: true },
    });
    await recordAudit({
      actorId: sub,
      action: 'event.publish',
      entityType: 'event',
      entityId: id,
    });
    return serializeDetail(updated, app.uploads);
  });

  app.post('/events/:id/cancel', async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };
    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'NotFound' });
    if (existing.status === 'cancelled') {
      return reply.status(409).send({ error: 'Conflict', message: 'already cancelled' });
    }
    const updated = await prisma.event.update({
      where: { id },
      data: { status: 'cancelled' },
      include: { tiers: true },
    });
    await recordAudit({
      actorId: sub,
      action: 'event.cancel',
      entityType: 'event',
      entityId: id,
    });
    return serializeDetail(updated, app.uploads);
  });

  app.get('/events', async () => {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        type: true,
        startsAt: true,
        endsAt: true,
        city: true,
        stateCode: true,
        capacity: true,
        publishedAt: true,
        createdAt: true,
      },
    });
    return {
      items: events.map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        status: e.status,
        type: e.type,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        city: e.city,
        stateCode: e.stateCode,
        capacity: e.capacity,
        publishedAt: e.publishedAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
};

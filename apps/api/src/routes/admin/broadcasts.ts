import { prisma } from '@jdm/db';
import type { BroadcastSummary } from '@jdm/shared';
import {
  broadcastDryRunRequestSchema,
  createBroadcastRequestSchema,
  updateBroadcastRequestSchema,
} from '@jdm/shared';
import type { Broadcast } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../../plugins/auth.js';
import { countRecipients } from '../../services/broadcasts/targets.js';

const serializeSummary = (
  b: Broadcast,
  stats?: { sent: number; failed: number; pending: number },
): BroadcastSummary => ({
  id: b.id,
  title: b.title,
  body: b.body,
  targetKind: b.targetKind,
  targetValue: b.targetValue,
  status: b.status,
  scheduledAt: b.scheduledAt?.toISOString() ?? null,
  startedAt: b.startedAt?.toISOString() ?? null,
  completedAt: b.completedAt?.toISOString() ?? null,
  createdAt: b.createdAt.toISOString(),
  sentCount: stats?.sent ?? 0,
  failedCount: stats?.failed ?? 0,
  pendingCount: stats?.pending ?? 0,
});

// eslint-disable-next-line @typescript-eslint/require-await
export const adminBroadcastRoutes: FastifyPluginAsync = async (app) => {
  app.post('/broadcasts/dry-run', async (request, reply) => {
    requireUser(request);
    const input = broadcastDryRunRequestSchema.parse(request.body);
    const count = await countRecipients(input.target);
    return reply.send({ estimatedRecipients: count });
  });

  app.post('/broadcasts', async (request, reply) => {
    const { sub } = requireUser(request);
    const input = createBroadcastRequestSchema.parse(request.body);

    const targetValue =
      input.target.kind === 'attendees_of_event'
        ? input.target.eventId
        : input.target.kind === 'city'
          ? input.target.city
          : null;

    const status = input.scheduledAt ? 'scheduled' : 'draft';

    const broadcast = await prisma.broadcast.create({
      data: {
        title: input.title,
        body: input.body,
        data: input.data ?? {},
        targetKind: input.target.kind,
        targetValue,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status,
        createdByAdminId: sub,
      },
    });

    return reply.status(201).send(serializeSummary(broadcast));
  });

  app.get('/broadcasts', async (request, reply) => {
    requireUser(request);
    const broadcasts = await prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const ids = broadcasts.map((b) => b.id);
    const deliveryCounts = await prisma.broadcastDelivery.groupBy({
      by: ['broadcastId', 'status'],
      where: { broadcastId: { in: ids } },
      _count: true,
    });

    const statsMap = new Map<string, { sent: number; failed: number; pending: number }>();
    for (const row of deliveryCounts) {
      if (!statsMap.has(row.broadcastId)) {
        statsMap.set(row.broadcastId, { sent: 0, failed: 0, pending: 0 });
      }
      const s = statsMap.get(row.broadcastId)!;
      if (row.status === 'sent') s.sent = row._count;
      else if (row.status === 'failed') s.failed = row._count;
      else if (row.status === 'pending') s.pending = row._count;
    }

    return reply.send({
      broadcasts: broadcasts.map((b) => serializeSummary(b, statsMap.get(b.id))),
    });
  });

  app.get('/broadcasts/:id', async (request, reply) => {
    requireUser(request);
    const { id } = request.params as { id: string };

    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) return reply.notFound();

    const counts = await prisma.broadcastDelivery.groupBy({
      by: ['status'],
      where: { broadcastId: id },
      _count: true,
    });

    const stats = { sent: 0, failed: 0, pending: 0 };
    for (const row of counts) {
      if (row.status === 'sent') stats.sent = row._count;
      else if (row.status === 'failed') stats.failed = row._count;
      else if (row.status === 'pending') stats.pending = row._count;
    }

    return reply.send(serializeSummary(broadcast, stats));
  });

  app.patch('/broadcasts/:id', async (request, reply) => {
    requireUser(request);
    const { id } = request.params as { id: string };
    const input = updateBroadcastRequestSchema.parse(request.body);

    const existing = await prisma.broadcast.findUnique({ where: { id } });
    if (!existing) return reply.notFound();

    if (existing.status !== 'draft' && existing.status !== 'scheduled') {
      return reply.badRequest('Only draft or scheduled broadcasts can be edited');
    }

    const targetValue =
      input.target?.kind === 'attendees_of_event'
        ? input.target.eventId
        : input.target?.kind === 'city'
          ? input.target.city
          : input.target
            ? null
            : undefined;

    const updated = await prisma.broadcast.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.body !== undefined && { body: input.body }),
        ...(input.data !== undefined && { data: input.data }),
        ...(input.target !== undefined && { targetKind: input.target.kind }),
        ...(targetValue !== undefined && { targetValue }),
        ...(input.scheduledAt !== undefined && {
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          status: input.scheduledAt ? ('scheduled' as const) : ('draft' as const),
        }),
      },
    });

    return reply.send(serializeSummary(updated));
  });

  app.post('/broadcasts/:id/cancel', async (request, reply) => {
    requireUser(request);
    const { id } = request.params as { id: string };

    const existing = await prisma.broadcast.findUnique({ where: { id } });
    if (!existing) return reply.notFound();

    if (existing.status === 'sent' || existing.status === 'processing') {
      return reply.badRequest('Cannot cancel a broadcast that is already sent or processing');
    }

    if (existing.status === 'cancelled') {
      return reply.send(serializeSummary(existing));
    }

    const updated = await prisma.broadcast.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return reply.send(serializeSummary(updated));
  });
};

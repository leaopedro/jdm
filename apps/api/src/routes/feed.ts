import { prisma } from '@jdm/db';
import {
  feedCommentCreateInputSchema,
  feedCommentListResponseSchema,
  feedCommentResponseSchema,
  feedListResponseSchema,
  feedPostCreateInputSchema,
  feedPostPatchInputSchema,
  feedPostResponseSchema,
  feedReactionInputSchema,
} from '@jdm/shared/feed';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { isUniqueConstraintError } from '../lib/prisma-errors.js';
import { requireUser } from '../plugins/auth.js';
import { checkFeedPostAccess, checkFeedReadAccess, isFeedBanned } from '../services/feed/access.js';

const eventIdParam = z.object({ eventId: z.string().min(1) });
const postIdParam = z.object({ eventId: z.string().min(1), postId: z.string().min(1) });
const commentIdParam = z.object({ eventId: z.string().min(1), commentId: z.string().min(1) });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

const CAR_SELECT = {
  id: true,
  make: true,
  model: true,
  year: true,
  nickname: true,
  photos: { select: { objectKey: true, width: true, height: true, sortOrder: true } },
} as const;

const POST_SELECT = {
  id: true,
  eventId: true,
  body: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  authorUserId: true,
  car: { select: CAR_SELECT },
  photos: { select: { id: true, objectKey: true, width: true, height: true, sortOrder: true } },
  _count: {
    select: { reactions: { where: { kind: 'like' } }, comments: { where: { status: 'visible' } } },
  },
} as const;

type CarSelect = {
  id: string;
  make: string;
  model: string;
  year: number;
  nickname: string | null;
  photos: { objectKey: string; width: number | null; height: number | null; sortOrder: number }[];
};

const serializeCarProfile = (car: CarSelect | null, buildUrl: (key: string) => string) => {
  if (!car) return null;
  const primary = [...car.photos].sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
  return {
    id: car.id,
    make: car.make,
    model: car.model,
    year: car.year,
    nickname: car.nickname,
    photo: primary
      ? { url: buildUrl(primary.objectKey), width: primary.width, height: primary.height }
      : null,
  };
};

// eslint-disable-next-line @typescript-eslint/require-await
export const feedRoutes: FastifyPluginAsync = async (app) => {
  // ---- GET /events/:eventId/feed ----
  app.get('/events/:eventId/feed', { preHandler: [app.tryAuth] }, async (request, reply) => {
    const { eventId } = eventIdParam.parse(request.params);
    const { page, perPage } = listQuerySchema.parse(request.query);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, feedEnabled: true, feedAccess: true },
    });
    if (!event) return reply.status(404).send({ error: 'NotFound', message: 'Event not found' });
    if (!event.feedEnabled)
      return reply.status(403).send({ error: 'Forbidden', message: 'Feed disabled' });

    const userId = request.user?.sub ?? null;
    const role = request.user?.role ?? 'user';
    const access = await checkFeedReadAccess(eventId, userId, role);
    if (access === 'banned')
      return reply.status(403).send({ error: 'Forbidden', message: 'Banned from feed' });
    if (access === 'forbidden')
      return reply.status(403).send({ error: 'Forbidden', message: 'Access denied' });

    const where = { eventId, status: 'visible' as const };
    const [total, posts] = await Promise.all([
      prisma.feedPost.count({ where }),
      prisma.feedPost.findMany({
        where,
        select: POST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    let myReactions = new Map<string, string>();
    if (userId && posts.length > 0) {
      const reactions = await prisma.feedReaction.findMany({
        where: { postId: { in: posts.map((p) => p.id) }, userId },
        select: { postId: true, kind: true },
      });
      myReactions = new Map(reactions.map((r) => [r.postId, r.kind]));
    }

    const buildUrl = (key: string) => app.uploads.buildPublicUrl(key);

    return reply.status(200).send(
      feedListResponseSchema.parse({
        posts: posts.map((p) =>
          feedPostResponseSchema.parse({
            id: p.id,
            eventId: p.eventId,
            car: serializeCarProfile(p.car, buildUrl),
            body: p.body,
            status: p.status,
            photos: [...p.photos]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((ph) => ({
                id: ph.id,
                url: buildUrl(ph.objectKey),
                width: ph.width,
                height: ph.height,
                sortOrder: ph.sortOrder,
              })),
            reactions: { likes: p._count.reactions, mine: myReactions.get(p.id) === 'like' },
            commentCount: p._count.comments,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
          }),
        ),
        page,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / perPage),
      }),
    );
  });

  // ---- POST /events/:eventId/feed ----
  app.post('/events/:eventId/feed', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub, role } = requireUser(request);
    const { eventId } = eventIdParam.parse(request.params);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { feedEnabled: true },
    });
    if (!event) return reply.status(404).send({ error: 'NotFound', message: 'Event not found' });
    if (!event.feedEnabled)
      return reply.status(403).send({ error: 'Forbidden', message: 'Feed disabled' });

    const access = await checkFeedPostAccess(eventId, sub, role);
    if (access === 'banned')
      return reply.status(403).send({ error: 'Forbidden', message: 'Banned from posting' });
    if (access === 'forbidden')
      return reply.status(403).send({ error: 'Forbidden', message: 'Posting access denied' });

    const { carId, body, photoObjectKeys } = feedPostCreateInputSchema.parse(request.body);

    if (photoObjectKeys?.length) {
      for (const key of photoObjectKeys) {
        if (!app.uploads.isOwnedKey(key, sub, 'feed_photo')) {
          return reply
            .status(403)
            .send({ error: 'Forbidden', message: 'Photo does not belong to you' });
        }
      }
    }

    if (carId) {
      const car = await prisma.car.findFirst({
        where: { id: carId, userId: sub },
        select: { id: true },
      });
      if (!car)
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Car does not belong to you' });
    }

    const buildUrl = (key: string) => app.uploads.buildPublicUrl(key);

    const post = await prisma.feedPost.create({
      data: {
        eventId,
        authorUserId: sub,
        carId: carId ?? null,
        body,
        status: 'visible',
        ...(photoObjectKeys?.length && {
          photos: { create: photoObjectKeys.map((key, i) => ({ objectKey: key, sortOrder: i })) },
        }),
      },
      select: POST_SELECT,
    });

    return reply.status(201).send(
      feedPostResponseSchema.parse({
        id: post.id,
        eventId: post.eventId,
        car: serializeCarProfile(post.car, buildUrl),
        body: post.body,
        status: post.status,
        photos: [...post.photos]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((ph) => ({
            id: ph.id,
            url: buildUrl(ph.objectKey),
            width: ph.width,
            height: ph.height,
            sortOrder: ph.sortOrder,
          })),
        reactions: { likes: 0, mine: false },
        commentCount: 0,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      }),
    );
  });

  // ---- PATCH /events/:eventId/feed/:postId ----
  app.patch(
    '/events/:eventId/feed/:postId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sub, role } = requireUser(request);
      const { eventId, postId } = postIdParam.parse(request.params);

      const parseResult = feedPostPatchInputSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: parseResult.error.errors[0]?.message ?? 'Invalid input',
        });
      }
      const patch = parseResult.data;

      const post = await prisma.feedPost.findFirst({ where: { id: postId, eventId } });
      if (!post) return reply.status(404).send({ error: 'NotFound', message: 'Post not found' });

      if (await isFeedBanned(eventId, sub))
        return reply.status(403).send({ error: 'Forbidden', message: 'Banned from posting' });

      const isStaff = role === 'organizer' || role === 'admin';
      if (!isStaff && post.authorUserId !== sub) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Not the post author' });
      }

      if (patch.photoObjectKeys?.length) {
        for (const key of patch.photoObjectKeys) {
          if (!app.uploads.isOwnedKey(key, sub, 'feed_photo')) {
            return reply
              .status(403)
              .send({ error: 'Forbidden', message: 'Photo does not belong to you' });
          }
        }
      }

      if (patch.photoObjectKeys !== undefined) {
        await prisma.feedPostPhoto.deleteMany({ where: { postId } });
      }

      const updated = await prisma.feedPost.update({
        where: { id: postId },
        data: {
          ...(patch.body !== undefined && { body: patch.body }),
          ...(patch.photoObjectKeys !== undefined && {
            photos: {
              create: patch.photoObjectKeys.map((key, i) => ({ objectKey: key, sortOrder: i })),
            },
          }),
        },
        select: POST_SELECT,
      });

      const myReaction = await prisma.feedReaction.findUnique({
        where: { postId_userId: { postId, userId: sub } },
        select: { kind: true },
      });
      const buildUrl = (key: string) => app.uploads.buildPublicUrl(key);

      return reply.status(200).send(
        feedPostResponseSchema.parse({
          id: updated.id,
          eventId: updated.eventId,
          car: serializeCarProfile(updated.car, buildUrl),
          body: updated.body,
          status: updated.status,
          photos: [...updated.photos]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((ph) => ({
              id: ph.id,
              url: buildUrl(ph.objectKey),
              width: ph.width,
              height: ph.height,
              sortOrder: ph.sortOrder,
            })),
          reactions: { likes: updated._count.reactions, mine: myReaction?.kind === 'like' },
          commentCount: updated._count.comments,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        }),
      );
    },
  );

  // ---- DELETE /events/:eventId/feed/:postId ----
  app.delete(
    '/events/:eventId/feed/:postId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sub, role } = requireUser(request);
      const { eventId, postId } = postIdParam.parse(request.params);

      const post = await prisma.feedPost.findFirst({ where: { id: postId, eventId } });
      if (!post) return reply.status(404).send({ error: 'NotFound', message: 'Post not found' });

      if (await isFeedBanned(eventId, sub))
        return reply.status(403).send({ error: 'Forbidden', message: 'Banned from posting' });

      const isStaff = role === 'organizer' || role === 'admin';
      if (!isStaff && post.authorUserId !== sub) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Not the post author' });
      }

      await prisma.feedPost.delete({ where: { id: postId } });
      return reply.status(204).send();
    },
  );

  // ---- GET /events/:eventId/feed/:postId/comments ----
  app.get(
    '/events/:eventId/feed/:postId/comments',
    { preHandler: [app.tryAuth] },
    async (request, reply) => {
      const { eventId, postId } = postIdParam.parse(request.params);
      const { page, perPage } = listQuerySchema.parse(request.query);

      const userId = request.user?.sub ?? null;
      const role = request.user?.role ?? 'user';

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { feedEnabled: true },
      });
      if (!event) return reply.status(404).send({ error: 'NotFound', message: 'Event not found' });
      if (!event.feedEnabled)
        return reply.status(403).send({ error: 'Forbidden', message: 'Feed disabled' });

      const post = await prisma.feedPost.findFirst({
        where: { id: postId, eventId, status: 'visible' },
        select: { id: true },
      });
      if (!post) return reply.status(404).send({ error: 'NotFound', message: 'Post not found' });

      const access = await checkFeedReadAccess(eventId, userId, role);
      if (access !== 'ok')
        return reply.status(403).send({ error: 'Forbidden', message: 'Access denied' });

      const where = { postId, status: 'visible' as const };
      const [total, comments] = await Promise.all([
        prisma.feedComment.count({ where }),
        prisma.feedComment.findMany({
          where,
          select: {
            id: true,
            postId: true,
            body: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            car: { select: CAR_SELECT },
          },
          orderBy: { createdAt: 'asc' },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
      ]);

      const buildUrl = (key: string) => app.uploads.buildPublicUrl(key);
      return reply.status(200).send(
        feedCommentListResponseSchema.parse({
          comments: comments.map((c) =>
            feedCommentResponseSchema.parse({
              id: c.id,
              postId: c.postId,
              car: serializeCarProfile(c.car, buildUrl),
              body: c.body,
              status: c.status,
              createdAt: c.createdAt.toISOString(),
              updatedAt: c.updatedAt.toISOString(),
            }),
          ),
          page,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / perPage),
        }),
      );
    },
  );

  // ---- POST /events/:eventId/feed/:postId/comments ----
  app.post(
    '/events/:eventId/feed/:postId/comments',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sub, role } = requireUser(request);
      const { eventId, postId } = postIdParam.parse(request.params);

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { feedEnabled: true },
      });
      if (!event) return reply.status(404).send({ error: 'NotFound', message: 'Event not found' });
      if (!event.feedEnabled)
        return reply.status(403).send({ error: 'Forbidden', message: 'Feed disabled' });

      const post = await prisma.feedPost.findFirst({
        where: { id: postId, eventId, status: 'visible' },
        select: { id: true },
      });
      if (!post) return reply.status(404).send({ error: 'NotFound', message: 'Post not found' });

      const access = await checkFeedPostAccess(eventId, sub, role);
      if (access === 'banned')
        return reply.status(403).send({ error: 'Forbidden', message: 'Banned from posting' });
      if (access === 'forbidden')
        return reply.status(403).send({ error: 'Forbidden', message: 'Posting access denied' });

      const { carId, body } = feedCommentCreateInputSchema.parse(request.body);

      if (carId) {
        const car = await prisma.car.findFirst({
          where: { id: carId, userId: sub },
          select: { id: true },
        });
        if (!car)
          return reply
            .status(403)
            .send({ error: 'Forbidden', message: 'Car does not belong to you' });
      }

      const buildUrl = (key: string) => app.uploads.buildPublicUrl(key);

      const comment = await prisma.feedComment.create({
        data: { postId, authorUserId: sub, carId: carId ?? null, body, status: 'visible' },
        select: {
          id: true,
          postId: true,
          body: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          car: { select: CAR_SELECT },
        },
      });

      return reply.status(201).send(
        feedCommentResponseSchema.parse({
          id: comment.id,
          postId: comment.postId,
          car: serializeCarProfile(comment.car, buildUrl),
          body: comment.body,
          status: comment.status,
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
        }),
      );
    },
  );

  // ---- DELETE /events/:eventId/feed/comments/:commentId ----
  app.delete(
    '/events/:eventId/feed/comments/:commentId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sub, role } = requireUser(request);
      const { eventId, commentId } = commentIdParam.parse(request.params);

      const comment = await prisma.feedComment.findFirst({
        where: { id: commentId, post: { eventId } },
        select: { id: true, authorUserId: true },
      });
      if (!comment)
        return reply.status(404).send({ error: 'NotFound', message: 'Comment not found' });

      if (await isFeedBanned(eventId, sub))
        return reply.status(403).send({ error: 'Forbidden', message: 'Banned from posting' });

      const isStaff = role === 'organizer' || role === 'admin';
      if (!isStaff && comment.authorUserId !== sub) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Not the comment author' });
      }

      await prisma.feedComment.delete({ where: { id: commentId } });
      return reply.status(204).send();
    },
  );

  // ---- POST /events/:eventId/feed/:postId/reactions ----
  app.post(
    '/events/:eventId/feed/:postId/reactions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sub, role } = requireUser(request);
      const { eventId, postId } = postIdParam.parse(request.params);
      const { kind } = feedReactionInputSchema.parse(request.body);

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { feedEnabled: true },
      });
      if (!event) return reply.status(404).send({ error: 'NotFound', message: 'Event not found' });
      if (!event.feedEnabled)
        return reply.status(403).send({ error: 'Forbidden', message: 'Feed disabled' });

      const access = await checkFeedReadAccess(eventId, sub, role);
      if (access === 'banned')
        return reply.status(403).send({ error: 'Forbidden', message: 'Banned from feed' });
      if (access === 'forbidden')
        return reply.status(403).send({ error: 'Forbidden', message: 'Access denied' });

      const post = await prisma.feedPost.findFirst({
        where: { id: postId, eventId, status: 'visible' },
        select: { id: true },
      });
      if (!post) return reply.status(404).send({ error: 'NotFound', message: 'Post not found' });

      const where = { postId_userId: { postId, userId: sub } };

      let created = false;
      try {
        await prisma.feedReaction.create({ data: { postId, userId: sub, kind } });
        created = true;
      } catch (err) {
        if (!isUniqueConstraintError(err)) throw err;
      }

      if (!created) {
        const existing = await prisma.feedReaction.findUnique({ where, select: { kind: true } });
        if (existing?.kind === kind) {
          await prisma.feedReaction.delete({ where });
        } else {
          await prisma.feedReaction.update({ where, data: { kind } });
        }
      }

      const [likes, mine] = await Promise.all([
        prisma.feedReaction.count({ where: { postId, kind: 'like' } }),
        prisma.feedReaction.findUnique({
          where,
          select: { kind: true },
        }),
      ]);

      const result = { likes, mine: mine?.kind === 'like' };

      return reply.status(200).send(result);
    },
  );
};

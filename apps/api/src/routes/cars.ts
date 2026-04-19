import { prisma } from '@jdm/db';
import { carInputSchema, carSchema, carUpdateSchema } from '@jdm/shared/cars';
import type { Car as DbCar, CarPhoto as DbPhoto } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import type { Uploads } from '../services/uploads/index.js';

type CarWithPhotos = DbCar & { photos: DbPhoto[] };

const serializeCar = (car: CarWithPhotos, uploads: Uploads) =>
  carSchema.parse({
    id: car.id,
    make: car.make,
    model: car.model,
    year: car.year,
    nickname: car.nickname,
    createdAt: car.createdAt.toISOString(),
    updatedAt: car.updatedAt.toISOString(),
    photos: car.photos
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({
        id: p.id,
        url: uploads.buildPublicUrl(p.objectKey),
        width: p.width,
        height: p.height,
        sortOrder: p.sortOrder,
      })),
  });

// eslint-disable-next-line @typescript-eslint/require-await
export const carRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me/cars', { preHandler: [app.authenticate] }, async (request) => {
    const { sub } = requireUser(request);
    const cars = await prisma.car.findMany({
      where: { userId: sub },
      include: { photos: true },
      orderBy: { createdAt: 'desc' },
    });
    return { cars: cars.map((c) => serializeCar(c, app.uploads)) };
  });

  app.post('/me/cars', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const parsed = carInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'BadRequest', issues: parsed.error.flatten() });
    }
    const { make, model, year, nickname } = parsed.data;
    const car = await prisma.car.create({
      data: { make, model, year, ...(nickname !== undefined ? { nickname } : {}), userId: sub },
      include: { photos: true },
    });
    return reply.status(201).send(serializeCar(car, app.uploads));
  });

  app.patch('/me/cars/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };
    const parsed = carUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'BadRequest', issues: parsed.error.flatten() });
    }
    const owned = await prisma.car.findFirst({ where: { id, userId: sub } });
    if (!owned) return reply.status(404).send({ error: 'NotFound' });
    const { make, model, year, nickname } = parsed.data;
    const updated = await prisma.car.update({
      where: { id },
      data: {
        ...(make !== undefined ? { make } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(year !== undefined ? { year } : {}),
        ...(nickname !== undefined ? { nickname } : {}),
      },
      include: { photos: true },
    });
    return serializeCar(updated, app.uploads);
  });

  app.delete('/me/cars/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };
    const owned = await prisma.car.findFirst({ where: { id, userId: sub } });
    if (!owned) return reply.status(404).send({ error: 'NotFound' });
    await prisma.car.delete({ where: { id } });
    return reply.status(204).send();
  });
};

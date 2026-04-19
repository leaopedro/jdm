import { prisma } from '@jdm/db';
import { addCarPhotoSchema, carInputSchema, carSchema, carUpdateSchema } from '@jdm/shared/cars';
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

  app.get('/me/cars/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };
    const car = await prisma.car.findFirst({
      where: { id, userId: sub },
      include: { photos: true },
    });
    if (!car) return reply.status(404).send({ error: 'NotFound' });
    return serializeCar(car, app.uploads);
  });

  app.post('/me/cars', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { make, model, year, nickname } = carInputSchema.parse(request.body);
    const car = await prisma.car.create({
      data: { make, model, year, ...(nickname !== undefined ? { nickname } : {}), userId: sub },
      include: { photos: true },
    });
    return reply.status(201).send(serializeCar(car, app.uploads));
  });

  app.patch('/me/cars/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };
    const owned = await prisma.car.findFirst({ where: { id, userId: sub } });
    if (!owned) return reply.status(404).send({ error: 'NotFound' });
    const { make, model, year, nickname } = carUpdateSchema.parse(request.body);
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
    const { count } = await prisma.car.deleteMany({ where: { id, userId: sub } });
    if (count === 0) return reply.status(404).send({ error: 'NotFound' });
    return reply.status(204).send();
  });

  app.post('/me/cars/:id/photos', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };
    const { objectKey, width, height } = addCarPhotoSchema.parse(request.body);
    if (!app.uploads.isOwnedKey(objectKey, sub, 'car_photo')) {
      return reply.status(400).send({ error: 'BadRequest', message: 'object key not owned' });
    }
    const car = await prisma.car.findFirst({ where: { id, userId: sub } });
    if (!car) return reply.status(404).send({ error: 'NotFound' });

    const count = await prisma.carPhoto.count({ where: { carId: id } });
    await prisma.carPhoto.create({
      data: {
        carId: id,
        objectKey,
        width: width ?? null,
        height: height ?? null,
        sortOrder: count,
      },
    });
    const updated = await prisma.car.findUniqueOrThrow({
      where: { id },
      include: { photos: true },
    });
    return reply.status(201).send(serializeCar(updated, app.uploads));
  });

  app.delete(
    '/me/cars/:id/photos/:photoId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sub } = requireUser(request);
      const { id, photoId } = request.params as { id: string; photoId: string };
      const car = await prisma.car.findFirst({ where: { id, userId: sub } });
      if (!car) return reply.status(404).send({ error: 'NotFound' });
      const { count } = await prisma.carPhoto.deleteMany({ where: { id: photoId, carId: id } });
      if (count === 0) return reply.status(404).send({ error: 'NotFound' });
      return reply.status(204).send();
    },
  );
};

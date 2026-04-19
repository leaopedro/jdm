import { prisma } from '@jdm/db';
import { carInputSchema, carSchema } from '@jdm/shared/cars';
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
};

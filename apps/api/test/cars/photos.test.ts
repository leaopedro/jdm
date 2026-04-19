import { prisma } from '@jdm/db';
import { carSchema } from '@jdm/shared/cars';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

describe('car photos', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('adds a photo when the objectKey belongs to the caller', async () => {
    const { user } = await createUser({ verified: true });
    const car = await prisma.car.create({
      data: { userId: user.id, make: 'Mazda', model: 'RX7', year: 1993 },
    });
    const env = loadEnv();
    const objectKey = `car_photo/${user.id}/abc.jpg`;
    const res = await app.inject({
      method: 'POST',
      url: `/me/cars/${car.id}/photos`,
      headers: { authorization: bearer(env, user.id) },
      payload: { objectKey, width: 1200, height: 800 },
    });
    expect(res.statusCode).toBe(201);
    const body = carSchema.parse(res.json());
    expect(body.photos).toHaveLength(1);
    expect(body.photos[0]).toMatchObject({ width: 1200, height: 800 });
    expect(body.photos[0]?.url).toContain(objectKey);
  });

  it('rejects an objectKey not owned by caller', async () => {
    const { user: me } = await createUser({ email: 'me@jdm.test', verified: true });
    const { user: other } = await createUser({ email: 'o@jdm.test', verified: true });
    const car = await prisma.car.create({
      data: { userId: me.id, make: 'Mazda', model: 'RX7', year: 1993 },
    });
    const env = loadEnv();
    const res = await app.inject({
      method: 'POST',
      url: `/me/cars/${car.id}/photos`,
      headers: { authorization: bearer(env, me.id) },
      payload: { objectKey: `car_photo/${other.id}/abc.jpg` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when adding a photo to a car not owned by caller', async () => {
    const { user: me } = await createUser({ email: 'me@jdm.test', verified: true });
    const { user: other } = await createUser({ email: 'o@jdm.test', verified: true });
    const theirs = await prisma.car.create({
      data: { userId: other.id, make: 'Honda', model: 'NSX', year: 1991 },
    });
    const env = loadEnv();
    const res = await app.inject({
      method: 'POST',
      url: `/me/cars/${theirs.id}/photos`,
      headers: { authorization: bearer(env, me.id) },
      payload: { objectKey: `car_photo/${me.id}/x.jpg` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('deletes a photo on the caller\u2019s car', async () => {
    const { user } = await createUser({ verified: true });
    const car = await prisma.car.create({
      data: { userId: user.id, make: 'Mazda', model: 'RX7', year: 1993 },
    });
    const photo = await prisma.carPhoto.create({
      data: { carId: car.id, objectKey: `car_photo/${user.id}/x.jpg` },
    });
    const env = loadEnv();
    const res = await app.inject({
      method: 'DELETE',
      url: `/me/cars/${car.id}/photos/${photo.id}`,
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(204);
    expect(await prisma.carPhoto.count()).toBe(0);
  });

  it('returns 404 deleting a photo that does not exist', async () => {
    const { user } = await createUser({ verified: true });
    const car = await prisma.car.create({
      data: { userId: user.id, make: 'Mazda', model: 'RX7', year: 1993 },
    });
    const env = loadEnv();
    const res = await app.inject({
      method: 'DELETE',
      url: `/me/cars/${car.id}/photos/nonexistent`,
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(404);
  });
});

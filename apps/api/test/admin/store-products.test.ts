import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

const seedProductType = async () =>
  prisma.productType.upsert({
    where: { name: 'Vestuário' },
    update: {},
    create: { name: 'Vestuário' },
  });

const seedDraftProduct = async (slug: string) => {
  const productType = await seedProductType();
  return prisma.product.create({
    data: {
      slug,
      title: `Produto ${slug}`,
      description: 'Descrição',
      basePriceCents: 5000,
      productTypeId: productType.id,
      status: 'draft',
    },
  });
};

const orgAuth = async () => {
  const { user } = await createUser({ email: 'org@jdm.test', verified: true, role: 'organizer' });
  return bearer(loadEnv(), user.id, 'organizer');
};

describe('PATCH /admin/store/products/:id activation guard', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects activation when product has no photos', async () => {
    const product = await seedDraftProduct('camiseta-azul');
    const header = await orgAuth();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/store/products/${product.id}`,
      headers: { authorization: header },
      payload: { status: 'active' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'BadRequest' });
    const refreshed = await prisma.product.findUnique({ where: { id: product.id } });
    expect(refreshed?.status).toBe('draft');
  });

  it('allows activation once at least one photo exists', async () => {
    const product = await seedDraftProduct('camiseta-verde');
    await prisma.productPhoto.create({
      data: { productId: product.id, objectKey: 'store/products/x/photo.jpg', sortOrder: 0 },
    });
    const header = await orgAuth();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/store/products/${product.id}`,
      headers: { authorization: header },
      payload: { status: 'active' },
    });

    expect(res.statusCode).toBe(200);
    const refreshed = await prisma.product.findUnique({ where: { id: product.id } });
    expect(refreshed?.status).toBe('active');
  });

  it('allows non-status edits on a photo-less draft', async () => {
    const product = await seedDraftProduct('camiseta-preta');
    const header = await orgAuth();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/store/products/${product.id}`,
      headers: { authorization: header },
      payload: { title: 'Camiseta Preta v2' },
    });

    expect(res.statusCode).toBe(200);
    const refreshed = await prisma.product.findUnique({ where: { id: product.id } });
    expect(refreshed?.status).toBe('draft');
    expect(refreshed?.title).toBe('Camiseta Preta v2');
  });

  it('does not re-check the guard when product is already active', async () => {
    const product = await seedDraftProduct('camiseta-rosa');
    const photo = await prisma.productPhoto.create({
      data: { productId: product.id, objectKey: 'store/products/x/p.jpg', sortOrder: 0 },
    });
    await prisma.product.update({ where: { id: product.id }, data: { status: 'active' } });
    await prisma.productPhoto.delete({ where: { id: photo.id } });
    const header = await orgAuth();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/store/products/${product.id}`,
      headers: { authorization: header },
      payload: { status: 'active', title: 'Renomeado' },
    });

    expect(res.statusCode).toBe(200);
    const refreshed = await prisma.product.findUnique({ where: { id: product.id } });
    expect(refreshed?.status).toBe('active');
    expect(refreshed?.title).toBe('Renomeado');
  });
});

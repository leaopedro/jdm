import { prisma } from '@jdm/db';
import {
  storeCollectionListResponseSchema,
  storeCollectionSchema,
  storeProductDetailResponseSchema,
  storeProductImageSchema,
  storeProductListQuerySchema,
  storeProductListResponseSchema,
  storeProductSchema,
  storeProductSummarySchema,
  storeProductTypeListResponseSchema,
  storeProductTypeSchema,
  storeProductVariantSchema,
  type StoreSort,
} from '@jdm/shared/store';
import type {
  Collection as DbCollection,
  Prisma,
  Product as DbProduct,
  ProductPhoto as DbProductPhoto,
  ProductType as DbProductType,
  Variant as DbVariant,
} from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

import type { Uploads } from '../services/uploads/index.js';

type ProductWithRelations = DbProduct & {
  productType: DbProductType;
  variants: DbVariant[];
  photos: DbProductPhoto[];
  collections: { collectionId: string }[];
};

const slugify = (input: string): string => {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'tipo';
};

const serializeProductType = (pt: DbProductType) =>
  storeProductTypeSchema.parse({
    id: pt.id,
    slug: slugify(pt.name),
    name: pt.name,
    description: null,
  });

const serializeCollection = (c: DbCollection & { _count?: { products: number } }) =>
  storeCollectionSchema.parse({
    id: c.id,
    slug: c.slug,
    title: c.name,
    description: c.description,
    heroImageUrl: null,
    sortOrder: c.sortOrder,
    productCount: c._count?.products ?? 0,
  });

const serializeImage = (photo: DbProductPhoto, uploads: Uploads) =>
  storeProductImageSchema.parse({
    id: photo.id,
    url: uploads.buildPublicUrl(photo.objectKey),
    alt: null,
    sortOrder: photo.sortOrder,
  });

const serializeVariant = (v: DbVariant, currency: string) =>
  storeProductVariantSchema.parse({
    id: v.id,
    sku: v.sku ?? v.id,
    title: v.name,
    priceCents: v.priceCents,
    compareAtPriceCents: null,
    currency,
    stockOnHand: Math.max(0, v.quantityTotal - v.quantitySold),
    isActive: v.active,
  });

const computePriceRange = (
  variants: DbVariant[],
  currency: string,
  fallback: number,
): { minPriceCents: number; maxPriceCents: number; currency: string } => {
  if (variants.length === 0) {
    return { minPriceCents: fallback, maxPriceCents: fallback, currency };
  }
  const prices = variants.map((v) => v.priceCents);
  return {
    minPriceCents: Math.min(...prices),
    maxPriceCents: Math.max(...prices),
    currency,
  };
};

const hasStock = (variants: DbVariant[]): boolean =>
  variants.some((v) => v.active && v.quantitySold < v.quantityTotal);

const serializeSummary = (product: ProductWithRelations, uploads: Uploads) => {
  const activeVariants = product.variants.filter((v) => v.active);
  const sortedPhotos = [...product.photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const cover = sortedPhotos[0] ? uploads.buildPublicUrl(sortedPhotos[0].objectKey) : null;
  return storeProductSummarySchema.parse({
    id: product.id,
    slug: product.slug,
    title: product.title,
    shortDescription: null,
    requiresShipping: product.shippingFeeCents !== null,
    coverImageUrl: cover,
    productType: serializeProductType(product.productType),
    priceRange: computePriceRange(activeVariants, product.currency, product.basePriceCents),
    inStock: hasStock(activeVariants),
  });
};

const serializeDetail = (product: ProductWithRelations, uploads: Uploads) => {
  const activeVariants = product.variants.filter((v) => v.active);
  const variantsForResponse = activeVariants.length > 0 ? activeVariants : product.variants;
  const sortedPhotos = [...product.photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const cover = sortedPhotos[0] ? uploads.buildPublicUrl(sortedPhotos[0].objectKey) : null;
  return storeProductSchema.parse({
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    shortDescription: null,
    status: product.status,
    requiresShipping: product.shippingFeeCents !== null,
    coverImageUrl: cover,
    collectionIds: product.collections.map((c) => c.collectionId),
    productType: serializeProductType(product.productType),
    variants: variantsForResponse.map((v) => serializeVariant(v, product.currency)),
    images: sortedPhotos.map((p) => serializeImage(p, uploads)),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  });
};

type CursorPayload = { k: string | number; i: string };

const encodeCursor = (k: string | number, i: string): string =>
  Buffer.from(JSON.stringify({ k, i }), 'utf8').toString('base64url');

const decodeCursor = (raw: string): CursorPayload => {
  const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorPayload;
  if (
    typeof parsed.i !== 'string' ||
    (typeof parsed.k !== 'string' && typeof parsed.k !== 'number')
  ) {
    throw new Error('invalid cursor payload');
  }
  return parsed;
};

const cursorKeyForProduct = (product: ProductWithRelations, sort: StoreSort): string | number => {
  if (sort === 'price_asc' || sort === 'price_desc') return product.basePriceCents;
  return product.createdAt.toISOString();
};

const buildOrderBy = (sort: StoreSort): Prisma.ProductOrderByWithRelationInput[] => {
  switch (sort) {
    case 'price_asc':
      return [{ basePriceCents: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ basePriceCents: 'desc' }, { id: 'desc' }];
    case 'newest':
    case 'featured':
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
};

const buildCursorWhere = (
  sort: StoreSort,
  cursor: CursorPayload,
): Prisma.ProductWhereInput | null => {
  if (sort === 'price_asc') {
    if (typeof cursor.k !== 'number') return null;
    return {
      OR: [
        { basePriceCents: { gt: cursor.k } },
        { basePriceCents: cursor.k, id: { gt: cursor.i } },
      ],
    };
  }
  if (sort === 'price_desc') {
    if (typeof cursor.k !== 'number') return null;
    return {
      OR: [
        { basePriceCents: { lt: cursor.k } },
        { basePriceCents: cursor.k, id: { lt: cursor.i } },
      ],
    };
  }
  if (typeof cursor.k !== 'string') return null;
  const at = new Date(cursor.k);
  if (Number.isNaN(at.getTime())) return null;
  return {
    OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: cursor.i } }],
  };
};

// eslint-disable-next-line @typescript-eslint/require-await
export const storeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/store/product-types', async () => {
    const rows = await prisma.productType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return storeProductTypeListResponseSchema.parse({
      items: rows.map(serializeProductType),
    });
  });

  app.get('/store/collections', async () => {
    const rows = await prisma.collection.findMany({
      where: {
        active: true,
        products: { some: { product: { status: 'active' } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            products: { where: { product: { status: 'active' } } },
          },
        },
      },
    });
    return storeCollectionListResponseSchema.parse({
      items: rows.map(serializeCollection),
    });
  });

  app.get('/store/products', async (request, reply) => {
    const query = storeProductListQuerySchema.parse(request.query);
    const where: Prisma.ProductWhereInput = {
      status: 'active',
      variants: { some: { active: true } },
    };

    if (query.collectionSlug) {
      where.collections = {
        some: { collection: { slug: query.collectionSlug, active: true } },
      };
    }

    if (query.productTypeSlug) {
      const types = await prisma.productType.findMany();
      const matches = types
        .filter((t) => slugify(t.name) === query.productTypeSlug)
        .map((t) => t.id);
      if (matches.length === 0) {
        return storeProductListResponseSchema.parse({ items: [], nextCursor: null });
      }
      where.productTypeId = { in: matches };
    }

    if (query.q) {
      const term = query.q;
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.cursor) {
      let parsed: CursorPayload;
      try {
        parsed = decodeCursor(query.cursor);
      } catch {
        return reply.status(400).send({ error: 'BadRequest', message: 'invalid cursor' });
      }
      const cursorWhere = buildCursorWhere(query.sort, parsed);
      if (!cursorWhere) {
        return reply.status(400).send({ error: 'BadRequest', message: 'invalid cursor' });
      }
      where.AND = [...((where.AND as Prisma.ProductWhereInput[]) ?? []), cursorWhere];
    }

    const fetchSize = query.inStock ? Math.max(query.limit * 3, query.limit + 1) : query.limit + 1;
    const rows = await prisma.product.findMany({
      where,
      orderBy: buildOrderBy(query.sort),
      include: {
        productType: true,
        variants: true,
        photos: true,
        collections: { select: { collectionId: true } },
      },
      take: fetchSize,
    });

    let filtered = rows;
    if (query.inStock) {
      filtered = rows.filter((p) =>
        p.variants.some((v) => v.active && v.quantitySold < v.quantityTotal),
      );
    }

    const hasMore = filtered.length > query.limit;
    const page = hasMore ? filtered.slice(0, query.limit) : filtered;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(cursorKeyForProduct(last, query.sort), last.id) : null;

    return storeProductListResponseSchema.parse({
      items: page.map((p) => serializeSummary(p, app.uploads)),
      nextCursor,
    });
  });

  app.get('/store/products/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const product = await prisma.product.findFirst({
      where: { slug, status: 'active' },
      include: {
        productType: true,
        variants: true,
        photos: true,
        collections: { select: { collectionId: true } },
      },
    });
    if (!product) return reply.status(404).send({ error: 'NotFound' });

    const collectionIds = product.collections.map((c) => c.collectionId);
    const collections = collectionIds.length
      ? await prisma.collection.findMany({
          where: { id: { in: collectionIds }, active: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            _count: {
              select: {
                products: { where: { product: { status: 'active' } } },
              },
            },
          },
        })
      : [];

    return storeProductDetailResponseSchema.parse({
      product: serializeDetail(product, app.uploads),
      collections: collections.map(serializeCollection),
    });
  });
};

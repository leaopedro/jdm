import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);
const hours = (n: number) => n * 3_600_000;

const events = [
  {
    slug: 'encontro-jdm-sp-2026-05',
    title: 'Encontro JDM São Paulo: Maio',
    description: 'Domingo de exposição e rolê no autódromo. Traga seu carro e venha curtir.',
    startsAt: daysFromNow(14),
    endsAt: new Date(daysFromNow(14).getTime() + hours(8)),
    venueName: 'Autódromo de Interlagos',
    venueAddress: 'Av. Senador Teotônio Vilela, 261, Interlagos',
    city: 'São Paulo',
    stateCode: 'SP',
    type: 'meeting' as const,
    status: 'published' as const,
    capacity: 500,
    tiers: [
      { name: 'Pista', priceCents: 4000, quantityTotal: 400, sortOrder: 0 },
      { name: 'VIP', priceCents: 12000, quantityTotal: 50, sortOrder: 1 },
    ],
  },
  {
    slug: 'drift-day-curitiba-2026-06',
    title: 'Drift Day Curitiba',
    description: 'Sessão de drift aberta a inscritos. Vagas limitadas.',
    startsAt: daysFromNow(30),
    endsAt: new Date(daysFromNow(30).getTime() + hours(10)),
    venueName: 'Autódromo Internacional de Curitiba',
    venueAddress: 'Rodovia Deputado João Leopoldo Jacomel, s/n, Pinhais',
    city: 'Curitiba',
    stateCode: 'PR',
    type: 'drift' as const,
    status: 'published' as const,
    capacity: 80,
    tiers: [{ name: 'Piloto', priceCents: 35000, quantityTotal: 80, sortOrder: 0 }],
  },
  {
    slug: 'encontro-jdm-rj-2026-03',
    title: 'Encontro JDM Rio: Março (encerrado)',
    description: 'Edição anterior.',
    startsAt: daysFromNow(-30),
    endsAt: new Date(daysFromNow(-30).getTime() + hours(6)),
    venueName: 'Aterro do Flamengo',
    venueAddress: 'Av. Infante Dom Henrique',
    city: 'Rio de Janeiro',
    stateCode: 'RJ',
    type: 'meeting' as const,
    status: 'published' as const,
    capacity: 300,
    tiers: [{ name: 'Geral', priceCents: 3000, quantityTotal: 300, sortOrder: 0 }],
  },
  {
    slug: 'rascunho-secreto',
    title: 'Rascunho (não deve aparecer)',
    description: 'Evento em rascunho.',
    startsAt: daysFromNow(60),
    endsAt: new Date(daysFromNow(60).getTime() + hours(4)),
    venueName: null,
    venueAddress: null,
    city: 'São Paulo',
    stateCode: 'SP',
    type: 'other' as const,
    status: 'draft' as const,
    capacity: 10,
    tiers: [{ name: 'Geral', priceCents: 0, quantityTotal: 10, sortOrder: 0 }],
  },
];

const STORE_PRODUCT_TYPE_NAME = 'Vestuário e Acessórios';

const STORE_COLLECTION = {
  slug: 'colecao-jdm-2026',
  name: 'Coleção JDM 2026',
  description: 'Peças oficiais para os encontros JDM da temporada.',
  sortOrder: 0,
};

type SeedVariant = {
  name: string;
  sku: string;
  priceCents: number;
  quantityTotal: number;
  attributes: Prisma.InputJsonValue;
};

type SeedProduct = {
  slug: string;
  title: string;
  description: string;
  basePriceCents: number;
  status: 'draft' | 'active' | 'archived';
  shippingFeeCents: number | null;
  variants: SeedVariant[];
};

const STORE_PRODUCTS: SeedProduct[] = [
  {
    slug: 'camiseta-jdm-classic',
    title: 'Camiseta JDM Classic',
    description:
      'Camiseta de algodão pesado com estampa JDM Classic nas costas. Caimento regular, gola reforçada.',
    basePriceCents: 12900,
    status: 'active',
    shippingFeeCents: null,
    variants: [
      {
        name: 'Tamanho P',
        sku: 'JDM-TEE-CLS-P',
        priceCents: 12900,
        quantityTotal: 30,
        attributes: { size: 'P', color: 'Preto' },
      },
      {
        name: 'Tamanho M',
        sku: 'JDM-TEE-CLS-M',
        priceCents: 12900,
        quantityTotal: 50,
        attributes: { size: 'M', color: 'Preto' },
      },
      {
        name: 'Tamanho G',
        sku: 'JDM-TEE-CLS-G',
        priceCents: 12900,
        quantityTotal: 40,
        attributes: { size: 'G', color: 'Preto' },
      },
    ],
  },
  {
    slug: 'adesivo-jdm-logo',
    title: 'Adesivo JDM Logo',
    description: 'Adesivo recortado em vinil resistente, 12x6 cm. Aplicação interna ou externa.',
    basePriceCents: 1500,
    status: 'active',
    shippingFeeCents: 0,
    variants: [
      {
        name: 'Único',
        sku: 'JDM-STK-LOGO',
        priceCents: 1500,
        quantityTotal: 200,
        attributes: { size: '12x6cm' },
      },
    ],
  },
];

const seedStore = async (): Promise<void> => {
  const productType = await prisma.productType.upsert({
    where: { name: STORE_PRODUCT_TYPE_NAME },
    update: { sortOrder: 0 },
    create: { name: STORE_PRODUCT_TYPE_NAME, sortOrder: 0 },
  });

  const collection = await prisma.collection.upsert({
    where: { slug: STORE_COLLECTION.slug },
    update: {
      name: STORE_COLLECTION.name,
      description: STORE_COLLECTION.description,
      sortOrder: STORE_COLLECTION.sortOrder,
      active: true,
    },
    create: {
      slug: STORE_COLLECTION.slug,
      name: STORE_COLLECTION.name,
      description: STORE_COLLECTION.description,
      sortOrder: STORE_COLLECTION.sortOrder,
      active: true,
    },
  });

  for (const [index, product] of STORE_PRODUCTS.entries()) {
    const upserted = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        title: product.title,
        description: product.description,
        basePriceCents: product.basePriceCents,
        status: product.status,
        shippingFeeCents: product.shippingFeeCents,
        productTypeId: productType.id,
      },
      create: {
        slug: product.slug,
        title: product.title,
        description: product.description,
        basePriceCents: product.basePriceCents,
        status: product.status,
        shippingFeeCents: product.shippingFeeCents,
        productTypeId: productType.id,
      },
    });

    for (const variant of product.variants) {
      const existing = await prisma.variant.findFirst({
        where: { productId: upserted.id, name: variant.name },
      });
      if (existing) {
        await prisma.variant.update({
          where: { id: existing.id },
          data: {
            sku: variant.sku,
            priceCents: variant.priceCents,
            attributes: variant.attributes,
            active: true,
          },
        });
      } else {
        await prisma.variant.create({
          data: {
            productId: upserted.id,
            name: variant.name,
            sku: variant.sku,
            priceCents: variant.priceCents,
            quantityTotal: variant.quantityTotal,
            attributes: variant.attributes,
            active: true,
          },
        });
      }
    }

    await prisma.productCollection.upsert({
      where: {
        productId_collectionId: {
          productId: upserted.id,
          collectionId: collection.id,
        },
      },
      update: { sortOrder: index },
      create: {
        productId: upserted.id,
        collectionId: collection.id,
        sortOrder: index,
      },
    });
  }

  const existingSettings = await prisma.storeSettings.findFirst();
  if (existingSettings) {
    await prisma.storeSettings.update({
      where: { id: existingSettings.id },
      data: {
        defaultShippingFeeCents: 1990,
        lowStockThreshold: 5,
        pickupDisplayLabel: 'Retirada nos encontros JDM',
        supportPhone: '+5511999999999',
      },
    });
  } else {
    await prisma.storeSettings.create({
      data: {
        defaultShippingFeeCents: 1990,
        lowStockThreshold: 5,
        pickupDisplayLabel: 'Retirada nos encontros JDM',
        supportPhone: '+5511999999999',
      },
    });
  }

  const variantCount = STORE_PRODUCTS.reduce((sum, p) => sum + p.variants.length, 0);
  console.log(
    `Seeded store: 1 product type, 1 collection, ${STORE_PRODUCTS.length} products, ${variantCount} variants, store settings.`,
  );
};

const main = async (): Promise<void> => {
  for (const e of events) {
    const { tiers, ...rest } = e;
    // Refresh time-sensitive fields on re-run so "upcoming" stays upcoming.
    // Tiers are not touched on update: quantitySold is load-bearing once F4 ships.
    const publishedAt = rest.status === 'published' ? new Date() : null;
    await prisma.event.upsert({
      where: { slug: rest.slug },
      update: {
        startsAt: rest.startsAt,
        endsAt: rest.endsAt,
        status: rest.status,
        publishedAt,
      },
      create: {
        ...rest,
        publishedAt,
        tiers: { create: tiers },
      },
    });
  }
  console.log(`Seeded ${events.length} events.`);

  await seedStore();
};

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

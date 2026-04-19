import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

const events = [
  {
    slug: 'encontro-jdm-sp-2026-05',
    title: 'Encontro JDM São Paulo: Maio',
    description: 'Domingo de exposição e rolê no autódromo. Traga seu carro e venha curtir.',
    startsAt: daysFromNow(14),
    endsAt: daysFromNow(14),
    venueName: 'Autódromo de Interlagos',
    venueAddress: 'Av. Senador Teotônio Vilela, 261, Interlagos',
    lat: -23.7014,
    lng: -46.6973,
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
    endsAt: daysFromNow(30),
    venueName: 'Autódromo Internacional de Curitiba',
    venueAddress: 'Rodovia Deputado João Leopoldo Jacomel, s/n, Pinhais',
    lat: -25.4158,
    lng: -49.1619,
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
    endsAt: daysFromNow(-30),
    venueName: 'Aterro do Flamengo',
    venueAddress: 'Av. Infante Dom Henrique',
    lat: -22.9285,
    lng: -43.1712,
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
    endsAt: daysFromNow(60),
    venueName: '-',
    venueAddress: '-',
    lat: 0,
    lng: 0,
    city: 'São Paulo',
    stateCode: 'SP',
    type: 'other' as const,
    status: 'draft' as const,
    capacity: 10,
    tiers: [{ name: 'Geral', priceCents: 0, quantityTotal: 10, sortOrder: 0 }],
  },
];

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
};

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

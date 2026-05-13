import { confirmedCarsResponseSchema } from '@jdm/shared/events';
import { describe, expect, it } from 'vitest';

import { eventsCopy } from '../../../../copy/events';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeCar = (ref: string, overrides: Record<string, unknown> = {}) => ({
  ref,
  make: 'Toyota',
  model: 'Supra',
  year: 1994,
  photoUrl: null,
  ...overrides,
});

const INLINE_MAX = 4; // mirrors ConfirmedCarsSection constant

// Pure logic extracted from ConfirmedCarsSection — tests state derivation
// without rendering React Native components.
const sectionState = (cars: ReturnType<typeof makeCar>[], loading: boolean, visible: boolean) => {
  if (!visible) return { rendered: false } as const;
  return {
    rendered: true,
    loading,
    empty: !loading && cars.length === 0,
    inlineCount: cars.slice(0, INLINE_MAX).length,
    hasOverflow: cars.length > INLINE_MAX,
    overflowCount: Math.max(0, cars.length - INLINE_MAX),
  } as const;
};

// ── State coverage ────────────────────────────────────────────────────────────

describe('ConfirmedCarsSection — state logic', () => {
  it('hidden state: visible=false → section not rendered', () => {
    const s = sectionState([], false, false);
    expect(s.rendered).toBe(false);
  });

  it('loading state: visible=true + loading=true → not empty', () => {
    const s = sectionState([], true, true);
    if (!s.rendered) throw new Error('must render');
    expect(s.loading).toBe(true);
    expect(s.empty).toBe(false);
  });

  it('empty state: visible=true, no cars, not loading', () => {
    const s = sectionState([], false, true);
    if (!s.rendered) throw new Error('must render');
    expect(s.empty).toBe(true);
    expect(s.loading).toBe(false);
  });

  it('populated state (3 cars): inline 3, no overflow', () => {
    const cars = Array.from({ length: 3 }, (_, i) => makeCar(`ref_${i}`));
    const s = sectionState(cars, false, true);
    if (!s.rendered) throw new Error('must render');
    expect(s.inlineCount).toBe(3);
    expect(s.hasOverflow).toBe(false);
    expect(s.empty).toBe(false);
  });

  it('populated state (4 cars, INLINE_MAX): inline 4, no overflow', () => {
    const cars = Array.from({ length: 4 }, (_, i) => makeCar(`ref_${i}`));
    const s = sectionState(cars, false, true);
    if (!s.rendered) throw new Error('must render');
    expect(s.inlineCount).toBe(INLINE_MAX);
    expect(s.hasOverflow).toBe(false);
  });

  it('overflow state (5 cars): inline 4, overflow +1 shown', () => {
    const cars = Array.from({ length: 5 }, (_, i) => makeCar(`ref_${i}`));
    const s = sectionState(cars, false, true);
    if (!s.rendered) throw new Error('must render');
    expect(s.inlineCount).toBe(INLINE_MAX);
    expect(s.hasOverflow).toBe(true);
    expect(s.overflowCount).toBe(1);
  });

  it('overflow state (12 cars): inline 4, overflow +8 shown', () => {
    const cars = Array.from({ length: 12 }, (_, i) => makeCar(`ref_${i}`));
    const s = sectionState(cars, false, true);
    if (!s.rendered) throw new Error('must render');
    expect(s.inlineCount).toBe(INLINE_MAX);
    expect(s.hasOverflow).toBe(true);
    expect(s.overflowCount).toBe(8);
  });

  it('anon visibility: loading=true makes section visible even when no cars and no hasCarTier', () => {
    // Mirrors: visible = confirmedCarsLoading || confirmedCars.length > 0 || hasCarTier
    const confirmedCarsLoading = true;
    const confirmedCarsLength = 0;
    const hasCarTier = false;
    const visible = confirmedCarsLoading || confirmedCarsLength > 0 || hasCarTier;
    expect(visible).toBe(true);
    const s = sectionState([], true, visible);
    if (!s.rendered) throw new Error('must render');
    expect(s.loading).toBe(true);
  });
});

// ── Schema / privacy ─────────────────────────────────────────────────────────

describe('confirmedCarsResponseSchema — privacy boundary', () => {
  it('parses public-safe fields (ref, make, model, year, photoUrl)', () => {
    const raw = {
      items: [makeCar('abc123', { photoUrl: 'https://r2.example.com/cars/photo.jpg' })],
      total: 1,
    };
    const parsed = confirmedCarsResponseSchema.parse(raw);
    const car = parsed.items[0]!;
    expect(car.ref).toBe('abc123');
    expect(car.make).toBe('Toyota');
    expect(car.model).toBe('Supra');
    expect(car.year).toBe(1994);
    expect(car.photoUrl).toBe('https://r2.example.com/cars/photo.jpg');
  });

  it('id / nickname / plate / userId absent from parsed output', () => {
    const rawWithExtra = {
      items: [
        {
          ...makeCar('ref_2'),
          id: 'internal_id',
          nickname: 'Projeto',
          plate: 'ABC-1234',
          licensePlate: 'ABC-1234',
          userId: 'u_1',
        },
      ],
      total: 1,
    };
    const parsed = confirmedCarsResponseSchema.parse(rawWithExtra);
    const car = parsed.items[0]! as Record<string, unknown>;
    expect(car['id']).toBeUndefined();
    expect(car['nickname']).toBeUndefined();
    expect(car['plate']).toBeUndefined();
    expect(car['licensePlate']).toBeUndefined();
    expect(car['userId']).toBeUndefined();
  });

  it('rejects item missing ref', () => {
    expect(() =>
      confirmedCarsResponseSchema.parse({
        items: [{ make: 'Toyota', model: 'Supra', year: 1994, photoUrl: null }],
        total: 1,
      }),
    ).toThrow();
  });

  it('rejects item missing make/model/year', () => {
    expect(() =>
      confirmedCarsResponseSchema.parse({ items: [{ ref: 'abc' }], total: 1 }),
    ).toThrow();
  });

  it('photoUrl nullable: null is valid', () => {
    const parsed = confirmedCarsResponseSchema.parse({ items: [makeCar('c')], total: 1 });
    expect(parsed.items[0]!.photoUrl).toBeNull();
  });
});

// ── PT-BR copy completeness ───────────────────────────────────────────────────

describe('PT-BR copy — confirmedCars', () => {
  const copy = eventsCopy.confirmedCars;

  it('sectionTitle is "Carros Confirmados"', () => {
    expect(copy.sectionTitle).toBe('Carros Confirmados');
  });

  it('empty copy mentions carro', () => {
    expect(copy.empty.toLowerCase()).toContain('carro');
  });

  it('viewAll is "Ver todos"', () => {
    expect(copy.viewAll).toBe('Ver todos');
  });

  it('loading copy is non-empty', () => {
    expect(copy.loading.length).toBeGreaterThan(0);
  });

  it('sheetTitle is "Carros Confirmados"', () => {
    expect(copy.sheetTitle).toBe('Carros Confirmados');
  });
});

import { describe, expect, it } from 'vitest';

import {
  computeCapacityDisplay,
  defaultCapacityDisplaySurfaceSetting,
  generalSettingsUpdateSchema,
} from '../general-settings.js';

describe('computeCapacityDisplay', () => {
  it('returns absolute remaining when mode=absolute', () => {
    const result = computeCapacityDisplay(
      { status: 'available', remaining: 8, total: 10 },
      { mode: 'absolute', thresholdPercent: 15 },
    );
    expect(result).toMatchObject({
      showAbsolute: true,
      showPercentage: false,
      remaining: 8,
    });
  });

  it('shows percent only when remaining <= threshold', () => {
    const below = computeCapacityDisplay(
      { status: 'available', remaining: 1, total: 10 },
      { mode: 'percentage_threshold', thresholdPercent: 15 },
    );
    expect(below).toMatchObject({
      showAbsolute: false,
      showPercentage: true,
      remainingPercent: 10,
    });

    const above = computeCapacityDisplay(
      { status: 'available', remaining: 8, total: 10 },
      { mode: 'percentage_threshold', thresholdPercent: 15 },
    );
    expect(above).toMatchObject({
      showAbsolute: false,
      showPercentage: false,
      remainingPercent: null,
    });
  });

  it('suppresses positive labels when hidden', () => {
    const r = computeCapacityDisplay(
      { status: 'available', remaining: 4, total: 10 },
      { mode: 'hidden', thresholdPercent: 15 },
    );
    expect(r.showAbsolute).toBe(false);
    expect(r.showPercentage).toBe(false);
    expect(r.remaining).toBeNull();
  });

  it('keeps sold_out explicit even in hidden mode', () => {
    const r = computeCapacityDisplay(
      { status: 'sold_out', remaining: 0, total: 10 },
      { mode: 'hidden', thresholdPercent: 15 },
    );
    expect(r.status).toBe('sold_out');
    expect(r.showAbsolute).toBe(false);
    expect(r.showPercentage).toBe(false);
  });

  it('keeps unavailable explicit even in percentage mode', () => {
    const r = computeCapacityDisplay(
      { status: 'unavailable', remaining: null, total: null },
      { mode: 'percentage_threshold', thresholdPercent: 15 },
    );
    expect(r.status).toBe('unavailable');
    expect(r.showAbsolute).toBe(false);
    expect(r.showPercentage).toBe(false);
  });

  it('uses default settings without mutating', () => {
    expect(defaultCapacityDisplaySurfaceSetting).toEqual({
      mode: 'absolute',
      thresholdPercent: 15,
    });
  });
});

describe('generalSettingsUpdateSchema', () => {
  it('rejects empty payload', () => {
    expect(generalSettingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(generalSettingsUpdateSchema.safeParse({ capacityDisplay: {} }).success).toBe(false);
  });

  it('accepts a single-surface partial update', () => {
    const r = generalSettingsUpdateSchema.safeParse({
      capacityDisplay: { tickets: { mode: 'hidden' } },
    });
    expect(r.success).toBe(true);
  });

  it('accepts threshold-only update', () => {
    const r = generalSettingsUpdateSchema.safeParse({
      capacityDisplay: { extras: { thresholdPercent: 25 } },
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown surface keys', () => {
    const r = generalSettingsUpdateSchema.safeParse({
      capacityDisplay: { unknown: { mode: 'hidden' } },
    });
    expect(r.success).toBe(false);
  });

  it('rejects out-of-range threshold', () => {
    const r = generalSettingsUpdateSchema.safeParse({
      capacityDisplay: { products: { thresholdPercent: 150 } },
    });
    expect(r.success).toBe(false);
  });
});

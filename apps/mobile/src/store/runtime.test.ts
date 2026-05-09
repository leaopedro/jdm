import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

const { ApiError } = await import('../api/client');
const {
  canAccessStoreRoutes,
  isStoreAvailable,
  isStoreDisabledError,
  resolveStoreSlot,
  shouldShowTicketsTab,
} = await import('./runtime');

describe('isStoreDisabledError', () => {
  it('detects the backend killswitch response', () => {
    const error = new ApiError(503, 'request failed', {
      error: 'ServiceUnavailable',
      message: 'store is currently disabled',
    });

    expect(isStoreDisabledError(error)).toBe(true);
  });

  it('ignores unrelated service-unavailable responses', () => {
    const error = new ApiError(503, 'request failed', {
      error: 'ServiceUnavailable',
      message: 'pix provider not configured',
    });

    expect(isStoreDisabledError(error)).toBe(false);
  });

  it('ignores non-api errors', () => {
    expect(isStoreDisabledError(new Error('boom'))).toBe(false);
  });
});

describe('store runtime visibility', () => {
  it('keeps Loja available until a runtime killswitch is confirmed', () => {
    expect(isStoreAvailable(null)).toBe(true);
    expect(resolveStoreSlot(null)).toBe('store');
    expect(shouldShowTicketsTab(null)).toBe(true);
    expect(canAccessStoreRoutes(null)).toBe(true);
  });

  it('replaces Loja with Ingressos when the runtime killswitch is off', () => {
    expect(isStoreAvailable(false)).toBe(false);
    expect(resolveStoreSlot(false)).toBe('tickets');
    expect(shouldShowTicketsTab(false)).toBe(false);
    expect(canAccessStoreRoutes(false)).toBe(false);
  });

  it('keeps the normal store nav when the runtime killswitch is on', () => {
    expect(isStoreAvailable(true)).toBe(true);
    expect(resolveStoreSlot(true)).toBe('store');
    expect(shouldShowTicketsTab(true)).toBe(true);
    expect(canAccessStoreRoutes(true)).toBe(true);
  });
});

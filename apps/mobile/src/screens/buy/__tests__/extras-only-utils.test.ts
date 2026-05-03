import { describe, expect, it } from 'vitest';

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const copy = {
  errorSoldOut: 'Este extra está esgotado.',
  errorAlreadyOwned: 'Você já possui este extra.',
  errorGeneric: 'Não conseguimos criar seu pedido. Tente novamente.',
};

function resolveConflictMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return copy.errorGeneric;
  const body = err.body as { message?: string } | null;
  const msg = body?.message ?? '';
  if (err.status === 409 && msg.includes('sold out')) return copy.errorSoldOut;
  if (err.status === 409 && msg.includes('already purchased')) return copy.errorAlreadyOwned;
  return copy.errorGeneric;
}

describe('resolveConflictMessage', () => {
  it('maps 409 sold out to PT-BR sold-out message', () => {
    const err = new ApiError(409, 'fail', { error: 'Conflict', message: 'extra abc is sold out' });
    expect(resolveConflictMessage(err)).toBe(copy.errorSoldOut);
  });

  it('maps 409 already purchased to PT-BR already-owned message', () => {
    const err = new ApiError(409, 'fail', {
      error: 'Conflict',
      message: 'extra already purchased for this ticket: abc',
    });
    expect(resolveConflictMessage(err)).toBe(copy.errorAlreadyOwned);
  });

  it('returns generic for non-409 ApiError', () => {
    const err = new ApiError(500, 'fail', {});
    expect(resolveConflictMessage(err)).toBe(copy.errorGeneric);
  });

  it('returns generic for 409 with unrecognized message', () => {
    const err = new ApiError(409, 'fail', { message: 'something else' });
    expect(resolveConflictMessage(err)).toBe(copy.errorGeneric);
  });

  it('returns generic for non-ApiError', () => {
    expect(resolveConflictMessage(new Error('network'))).toBe(copy.errorGeneric);
  });

  it('handles null body gracefully', () => {
    const err = new ApiError(409, 'fail');
    expect(resolveConflictMessage(err)).toBe(copy.errorGeneric);
  });
});

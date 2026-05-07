import { ApiError } from './client';

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  const body = error.body;
  if (typeof body !== 'object' || body === null) {
    return fallback;
  }

  const message = (body as { message?: unknown }).message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}

import { healthResponseSchema } from '@jdm/shared/health';
import type { HealthResponse } from '@jdm/shared/health';
import Constants from 'expo-constants';
import type { z } from 'zod';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
const DEFAULT_BASE = 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const request = async <T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> => {
  const base = extra.apiBaseUrl ?? DEFAULT_BASE;
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Request failed: ${response.status}`);
  }
  const json: unknown = await response.json();
  return schema.parse(json);
};

export const api = {
  health: (): Promise<HealthResponse> => request('/health', healthResponseSchema),
};

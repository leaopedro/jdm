import Constants from 'expo-constants';
import type { z } from 'zod';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
const DEFAULT_BASE = 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
};

export const baseUrl = (): string => extra.apiBaseUrl ?? DEFAULT_BASE;

export const request = async <T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;
  const response = await fetch(`${baseUrl()}${path}`, init);
  const text = await response.text();
  const parsed: unknown = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, `Request failed: ${response.status}`, parsed);
  }
  return schema.parse(parsed);
};

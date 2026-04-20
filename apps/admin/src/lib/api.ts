import { healthResponseSchema, type HealthResponse } from '@jdm/shared/health';
import { cookies } from 'next/headers';
import type { ZodType } from 'zod';

const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type FetchOptions = RequestInit & { auth?: boolean };

export const apiFetch = async <T>(
  path: string,
  opts: FetchOptions & { schema: ZodType<T> },
): Promise<T> => {
  const { schema, auth = true, headers, ...rest } = opts;
  const jar = await cookies();
  const access = jar.get('session_access')?.value;
  const h = new Headers(headers);
  h.set('content-type', 'application/json');
  if (auth && access) h.set('authorization', `Bearer ${access}`);

  const res = await fetch(`${base}${path}`, { ...rest, headers: h, cache: 'no-store' });
  if (!res.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, body.error ?? 'Error', body.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json();
  return schema.parse(json);
};

export const fetchHealth = async (): Promise<HealthResponse> =>
  apiFetch('/health', { schema: healthResponseSchema, auth: false });

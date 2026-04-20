import { authResponseSchema } from '@jdm/shared/auth';
import { healthResponseSchema, type HealthResponse } from '@jdm/shared/health';
import { cookies } from 'next/headers';
import type { ZodType } from 'zod';

import { writeSession } from './auth-session';

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

// Trade the refresh cookie for a fresh access token. Writes new session
// cookies best-effort: in server actions / route handlers the set persists;
// in server components it throws and we swallow it — the new token is still
// valid for this single request.
const refreshAccessToken = async (): Promise<string | null> => {
  const jar = await cookies();
  const refreshToken = jar.get('session_refresh')?.value;
  if (!refreshToken) return null;
  const res = await fetch(`${base}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  let parsed;
  try {
    parsed = authResponseSchema.parse(await res.json());
  } catch {
    return null;
  }
  try {
    await writeSession(parsed);
  } catch {
    // cookies are read-only in server components.
  }
  return parsed.accessToken;
};

export const apiFetch = async <T>(
  path: string,
  opts: FetchOptions & { schema: ZodType<T> },
): Promise<T> => {
  const { schema, auth = true, headers, ...rest } = opts;
  const jar = await cookies();
  const access = jar.get('session_access')?.value;
  const h = new Headers(headers);
  // Fastify rejects an empty body when content-type is application/json,
  // so only set it for requests that actually carry a body.
  if (rest.body) h.set('content-type', 'application/json');
  if (auth && access) h.set('authorization', `Bearer ${access}`);

  let res = await fetch(`${base}${path}`, { ...rest, headers: h, cache: 'no-store' });
  if (res.status === 401 && auth) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      h.set('authorization', `Bearer ${fresh}`);
      res = await fetch(`${base}${path}`, { ...rest, headers: h, cache: 'no-store' });
    }
  }
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

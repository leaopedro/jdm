import { healthResponseSchema, type HealthResponse } from '@jdm/shared/health';

const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export const fetchHealth = async (): Promise<HealthResponse> => {
  const response = await fetch(`${base}/health`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`API /health responded ${response.status}`);
  }
  const json: unknown = await response.json();
  return healthResponseSchema.parse(json);
};

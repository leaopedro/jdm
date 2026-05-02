import { healthResponseSchema } from '@jdm/shared/health';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';

describe('GET /health', () => {
  it('returns ok and a valid payload', async () => {
    const app = await buildApp(loadEnv());
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      const parsed = healthResponseSchema.parse(response.json());
      expect(parsed.status).toBe('ok');
      expect(response.headers['x-request-id']).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  it('coerces empty GIT_SHA to "dev"', async () => {
    const original = process.env.GIT_SHA;
    process.env.GIT_SHA = '';
    try {
      const app = await buildApp(loadEnv());
      try {
        const response = await app.inject({ method: 'GET', url: '/health' });
        expect(response.statusCode).toBe(200);
        const parsed = healthResponseSchema.parse(response.json());
        expect(parsed.sha).toBe('dev');
      } finally {
        await app.close();
      }
    } finally {
      if (original === undefined) {
        delete process.env.GIT_SHA;
      } else {
        process.env.GIT_SHA = original;
      }
    }
  });

  it('assigns a request id per request', async () => {
    const app = await buildApp(loadEnv());
    try {
      const a = await app.inject({ method: 'GET', url: '/health' });
      const b = await app.inject({ method: 'GET', url: '/health' });
      expect(a.headers['x-request-id']).not.toEqual(b.headers['x-request-id']);
    } finally {
      await app.close();
    }
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminNextConfig, parseAllowedDevOrigins } from './next.base-config.mjs';

test('parseAllowedDevOrigins returns undefined for empty values', () => {
  assert.equal(parseAllowedDevOrigins(undefined), undefined);
  assert.equal(parseAllowedDevOrigins(''), undefined);
  assert.equal(parseAllowedDevOrigins(' ,  , '), undefined);
});

test('parseAllowedDevOrigins trims comma-separated hosts', () => {
  assert.deepEqual(parseAllowedDevOrigins('192.168.1.85, admin.local ,*.localhost'), [
    '192.168.1.85',
    'admin.local',
    '*.localhost',
  ]);
});

test('buildAdminNextConfig wires allowedDevOrigins from env', () => {
  const config = buildAdminNextConfig({
    ALLOWED_DEV_ORIGINS: '192.168.1.85,admin.local',
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
  });

  assert.deepEqual(config.allowedDevOrigins, ['192.168.1.85', 'admin.local']);
  assert.equal(config.env.NEXT_PUBLIC_API_BASE_URL, 'http://localhost:4000');
});

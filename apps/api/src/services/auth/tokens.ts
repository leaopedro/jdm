import { createHmac, randomBytes } from 'node:crypto';

import type { UserRoleName } from '@jdm/shared/auth';
import jwt from 'jsonwebtoken';

type TokenEnv = {
  readonly JWT_ACCESS_SECRET: string;
  readonly REFRESH_TOKEN_PEPPER: string;
};

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 3_600_000;

export type AccessPayload = {
  sub: string;
  role: UserRoleName;
};

export const createAccessToken = (payload: AccessPayload, env: TokenEnv): string => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TTL_SECONDS,
  });
};

export const verifyAccessToken = (token: string, env: TokenEnv): AccessPayload => {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string') throw new Error('unexpected jwt payload');
  const { sub, role } = decoded as jwt.JwtPayload & AccessPayload;
  if (typeof sub !== 'string' || typeof role !== 'string') throw new Error('invalid jwt payload');
  return { sub, role };
};

export const hashRefreshToken = (token: string, env: TokenEnv): string => {
  return createHmac('sha256', env.REFRESH_TOKEN_PEPPER).update(token).digest('hex');
};

export const issueRefreshToken = (
  env: TokenEnv,
): { token: string; hash: string; expiresAt: Date } => {
  const token = randomBytes(32).toString('base64url');
  const hash = hashRefreshToken(token, env);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  return { token, hash, expiresAt };
};

export const accessTtlSeconds = ACCESS_TTL_SECONDS;

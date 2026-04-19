import type { Env } from '../../env.js';

import { DevUploads } from './dev.js';
import { R2Uploads } from './r2.js';
import type { Uploads } from './types.js';

export type { Uploads, PresignInput, PresignResult } from './types.js';
export { DevUploads } from './dev.js';

type R2Env = Env & {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_BASE_URL: string;
};

const R2_VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
] as const satisfies ReadonlyArray<keyof Env>;

const hasR2Env = (env: Env): env is R2Env =>
  R2_VARS.every((k) => typeof env[k] === 'string' && env[k].length > 0);

const countR2Vars = (env: Env): number =>
  R2_VARS.filter((k) => typeof env[k] === 'string' && env[k].length > 0).length;

export const buildUploads = (env: Env): Uploads => {
  const r2Ready = hasR2Env(env);

  if (env.NODE_ENV === 'production' && !r2Ready) {
    throw new Error('R2 env vars required in production');
  }

  // fail loudly in any environment if the operator set some but not all R2 vars
  const count = countR2Vars(env);
  if (!r2Ready && count > 0) {
    throw new Error(
      `Incomplete R2 config: ${count}/${R2_VARS.length} vars set — provide all or none`,
    );
  }

  if (r2Ready) {
    return new R2Uploads(
      {
        accountId: env.R2_ACCOUNT_ID,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      env.R2_BUCKET,
      env.R2_PUBLIC_BASE_URL,
      env.UPLOAD_URL_TTL_SECONDS,
    );
  }

  return new DevUploads();
};

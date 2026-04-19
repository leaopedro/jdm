import { z } from 'zod';

import { publicUserSchema } from './auth';

export const BRAZIL_STATE_CODES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;
export const stateCodeSchema = z.enum(BRAZIL_STATE_CODES);

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    bio: z.string().trim().max(500),
    city: z.string().trim().min(1).max(100),
    stateCode: stateCodeSchema,
    avatarObjectKey: z.string().min(1).max(300).nullable(),
  })
  .partial();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// publicProfileSchema is the API response shape. `avatarUrl` is server-derived
// from User.avatarObjectKey via app.uploads.buildPublicUrl.
export const publicProfileSchema = publicUserSchema.extend({
  bio: z.string().nullable(),
  city: z.string().nullable(),
  stateCode: stateCodeSchema.nullable(),
  avatarUrl: z.string().nullable(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

import { z } from 'zod';

export const carInputSchema = z.object({
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z
    .number()
    .int()
    .min(1900)
    .refine((y) => y <= new Date().getFullYear() + 1, { message: 'year out of range' }),
  nickname: z.string().trim().min(1).max(60).optional(),
});
export type CarInput = z.infer<typeof carInputSchema>;

export const carUpdateSchema = carInputSchema.partial();
export type CarUpdateInput = z.infer<typeof carUpdateSchema>;

// `url` is server-derived from the stored objectKey via app.uploads.buildPublicUrl.
// Clients must not persist it; re-fetch cars to get fresh URLs.
export const carPhotoSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  sortOrder: z.number().int(),
});
export type CarPhoto = z.infer<typeof carPhotoSchema>;

export const carSchema = z.object({
  id: z.string().min(1),
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  nickname: z.string().max(60).nullable(),
  photo: carPhotoSchema.nullable(),
  photos: z.array(carPhotoSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Car = z.infer<typeof carSchema>;

export const carListResponseSchema = z.object({
  cars: z.array(carSchema),
});
export type CarListResponse = z.infer<typeof carListResponseSchema>;

export const addCarPhotoSchema = z.object({
  objectKey: z.string().min(1).max(300),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type AddCarPhotoInput = z.infer<typeof addCarPhotoSchema>;

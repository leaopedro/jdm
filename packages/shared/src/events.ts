import { z } from 'zod';

import { stateCodeSchema } from './profile.js';

export const eventTypeSchema = z.enum(['meeting', 'drift', 'other']);
export type EventType = z.infer<typeof eventTypeSchema>;

export const eventStatusSchema = z.enum(['draft', 'published', 'cancelled']);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const eventWindowSchema = z.enum(['upcoming', 'past', 'all']);
export type EventWindow = z.infer<typeof eventWindowSchema>;

// TicketTier: `remainingCapacity` is server-computed from
// quantityTotal - quantitySold; clients must not derive it.
export const ticketTierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  quantityTotal: z.number().int().nonnegative(),
  remainingCapacity: z.number().int().nonnegative(),
  salesOpenAt: z.string().datetime().nullable(),
  salesCloseAt: z.string().datetime().nullable(),
  sortOrder: z.number().int(),
});
export type TicketTier = z.infer<typeof ticketTierSchema>;

// List item — lightweight, no tiers.
export const eventSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).max(140),
  title: z.string().min(1).max(140),
  coverUrl: z.string().url().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venueName: z.string(),
  city: z.string(),
  stateCode: stateCodeSchema,
  type: eventTypeSchema,
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

// Detail — full payload with tiers + venue geo.
export const eventDetailSchema = eventSummarySchema.extend({
  description: z.string(),
  venueAddress: z.string(),
  lat: z.number(),
  lng: z.number(),
  capacity: z.number().int().nonnegative(),
  tiers: z.array(ticketTierSchema),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

// Query: all filters optional. cursor is opaque base64 string.
export const eventListQuerySchema = z.object({
  window: eventWindowSchema.default('upcoming'),
  type: eventTypeSchema.optional(),
  stateCode: stateCodeSchema.optional(),
  city: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const eventListResponseSchema = z.object({
  items: z.array(eventSummarySchema),
  nextCursor: z.string().nullable(),
});
export type EventListResponse = z.infer<typeof eventListResponseSchema>;

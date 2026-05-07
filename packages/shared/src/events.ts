import { z } from 'zod';

import { eventExtraPublicSchema } from './extras.js';
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
  requiresCar: z.boolean(),
});
export type TicketTier = z.infer<typeof ticketTierSchema>;

// List item: lightweight, no tiers.
export const eventSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).max(140),
  title: z.string().min(1).max(140),
  coverUrl: z.string().url().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venueName: z.string().nullable(),
  city: z.string().nullable(),
  stateCode: stateCodeSchema.nullable(),
  type: eventTypeSchema,
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

// Public detail: anonymous-safe payload, no commerce data (no tiers, no extras).
export const eventDetailPublicSchema = eventSummarySchema.extend({
  description: z.string(),
  venueAddress: z.string().nullable(),
  capacity: z.number().int().nonnegative(),
  // null = unlimited; legacy responses may omit. Server enforces the real cap.
  maxTicketsPerUser: z.number().int().min(1).nullable().optional(),
});
export type EventDetailPublic = z.infer<typeof eventDetailPublicSchema>;

// Commerce detail: public detail + tiers + extras. Authenticated routes only.
export const eventDetailCommerceSchema = eventDetailPublicSchema.extend({
  tiers: z.array(ticketTierSchema),
  extras: z.array(eventExtraPublicSchema),
});
export type EventDetailCommerce = z.infer<typeof eventDetailCommerceSchema>;

// Query: all filters optional. cursor is opaque base64 string.
export const eventListQuerySchema = z.object({
  window: eventWindowSchema.default('upcoming'),
  type: eventTypeSchema.optional(),
  stateCode: stateCodeSchema.optional(),
  city: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const eventListResponseSchema = z.object({
  items: z.array(eventSummarySchema),
  nextCursor: z.string().nullable(),
});
export type EventListResponse = z.infer<typeof eventListResponseSchema>;

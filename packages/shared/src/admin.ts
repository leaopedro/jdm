import { z } from 'zod';

import { userRoleSchema } from './auth.js';
import {
  eventDetailSchema,
  eventStatusSchema,
  eventTypeSchema,
  ticketTierSchema,
} from './events.js';
import { orderStatusSchema } from './orders.js';
import { stateCodeSchema } from './profile.js';
import { ticketSourceSchema, ticketStatusSchema } from './tickets.js';

// Actions recorded in AdminAudit.action — literal union, no free-form strings.
export const adminAuditActionSchema = z.enum([
  'event.create',
  'event.update',
  'event.publish',
  'event.cancel',
  'tier.create',
  'tier.update',
  'tier.delete',
  'ticket.check_in',
  'ticket.grant_comp',
  'extra.create',
  'extra.update',
  'extra.delete',
]);
export type AdminAuditAction = z.infer<typeof adminAuditActionSchema>;

const slugSchema = z
  .string()
  .min(3)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case');

const coverObjectKeySchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^event_cover\//, 'must be an event_cover key')
  .nullable();

// Nullable inputs coerce empty strings to null so the admin form can post
// blank optional fields without client-side plumbing.
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().min(1).max(max).nullable(),
  );

export const adminEventCreateSchema = z
  .object({
    slug: slugSchema,
    title: z.string().trim().min(1).max(140),
    description: z.string().trim().min(1).max(10_000),
    coverObjectKey: coverObjectKeySchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    venueName: optionalText(140),
    venueAddress: optionalText(300),
    city: optionalText(100),
    stateCode: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      stateCodeSchema.nullable(),
    ),
    type: eventTypeSchema,
    capacity: z.number().int().nonnegative(),
    maxTicketsPerUser: z.number().int().min(1).max(10).default(1),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
export type AdminEventCreate = z.infer<typeof adminEventCreateSchema>;

// Slug is omitted here; admins must use a separate endpoint path if we ever
// allow slug edits. Status is explicitly not editable — use publish/cancel.
export const adminEventUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(140),
    description: z.string().trim().min(1).max(10_000),
    coverObjectKey: coverObjectKeySchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    venueName: optionalText(140),
    venueAddress: optionalText(300),
    city: optionalText(100),
    stateCode: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      stateCodeSchema.nullable(),
    ),
    type: eventTypeSchema,
    capacity: z.number().int().nonnegative(),
    maxTicketsPerUser: z.number().int().min(1).max(10),
  })
  .partial()
  .strict();
export type AdminEventUpdate = z.infer<typeof adminEventUpdateSchema>;

// Admin tier view — includes the organizer-confidential quantitySold.
export const adminTicketTierSchema = ticketTierSchema.extend({
  quantitySold: z.number().int().nonnegative(),
});
export type AdminTicketTier = z.infer<typeof adminTicketTierSchema>;

// Admin event detail — public detail + admin-only fields, with adminTicketTierSchema tiers.
export const adminEventDetailSchema = eventDetailSchema.omit({ tiers: true }).extend({
  status: eventStatusSchema,
  coverObjectKey: z.string().nullable(),
  maxTicketsPerUser: z.number().int().min(1).max(10),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tiers: z.array(adminTicketTierSchema),
});
export type AdminEventDetail = z.infer<typeof adminEventDetailSchema>;

// List row — lean, suitable for a table.
export const adminEventRowSchema = z.object({
  id: z.string().min(1),
  slug: z.string(),
  title: z.string(),
  status: eventStatusSchema,
  type: eventTypeSchema,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  city: z.string().nullable(),
  stateCode: stateCodeSchema.nullable(),
  capacity: z.number().int().nonnegative(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type AdminEventRow = z.infer<typeof adminEventRowSchema>;

export const adminEventListResponseSchema = z.object({
  items: z.array(adminEventRowSchema),
});
export type AdminEventListResponse = z.infer<typeof adminEventListResponseSchema>;

export const adminTierCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    priceCents: z.number().int().nonnegative(),
    currency: z.string().length(3).default('BRL'),
    quantityTotal: z.number().int().nonnegative(),
    salesOpenAt: z.string().datetime().nullable().optional(),
    salesCloseAt: z.string().datetime().nullable().optional(),
    sortOrder: z.number().int().optional(),
    requiresCar: z.boolean().optional(),
  })
  .refine(
    (v) => !v.salesOpenAt || !v.salesCloseAt || new Date(v.salesCloseAt) > new Date(v.salesOpenAt),
    { message: 'salesCloseAt must be after salesOpenAt', path: ['salesCloseAt'] },
  );
export type AdminTierCreate = z.infer<typeof adminTierCreateSchema>;

export const adminTierUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    priceCents: z.number().int().nonnegative(),
    quantityTotal: z.number().int().nonnegative(),
    salesOpenAt: z.string().datetime().nullable(),
    salesCloseAt: z.string().datetime().nullable(),
    sortOrder: z.number().int(),
    requiresCar: z.boolean(),
  })
  .partial()
  .strict();
export type AdminTierUpdate = z.infer<typeof adminTierUpdateSchema>;

export const adminGrantTicketSchema = z.object({
  userId: z.string().min(1),
  eventId: z.string().min(1),
  tierId: z.string().min(1),
  extras: z.array(z.string().min(1)).optional(),
  carId: z.string().min(1).optional(),
  licensePlate: z.string().trim().min(1).max(20).optional(),
  note: z.string().trim().min(1).max(500).optional(),
});
export type AdminGrantTicket = z.infer<typeof adminGrantTicketSchema>;

export const adminGrantTicketResponseSchema = z.object({
  ticketId: z.string().min(1),
  code: z.string().min(1),
  extraItems: z.array(
    z.object({
      extraId: z.string().min(1),
      code: z.string().min(1),
    }),
  ),
});
export type AdminGrantTicketResponse = z.infer<typeof adminGrantTicketResponseSchema>;

// ── Admin tickets list ──────────────────────────────────────────────

export const adminTicketsListQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  tier: z.string().min(1).optional(),
  status: ticketStatusSchema.optional(),
  source: ticketSourceSchema.optional(),
  extra: z.string().min(1).optional(),
  q: z.string().min(1).max(200).optional(),
});
export type AdminTicketsListQuery = z.infer<typeof adminTicketsListQuerySchema>;

export const adminTicketHolderSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
});

export const adminTicketTierSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

export const adminTicketExtraSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.string(),
  usedAt: z.string().datetime().nullable(),
});

export const adminTicketRowSchema = z.object({
  id: z.string().min(1),
  holder: adminTicketHolderSchema,
  tier: adminTicketTierSummarySchema,
  extras: z.array(adminTicketExtraSchema),
  status: ticketStatusSchema,
  source: ticketSourceSchema,
  code: z.string().min(1),
  usedAt: z.string().datetime().nullable(),
  car: z.string().nullable(),
  licensePlate: z.string().nullable(),
});
export type AdminTicketRow = z.infer<typeof adminTicketRowSchema>;

export const adminTicketsListResponseSchema = z.object({
  items: z.array(adminTicketRowSchema),
  nextCursor: z.string().nullable(),
});
export type AdminTicketsListResponse = z.infer<typeof adminTicketsListResponseSchema>;

// ── Admin user search + detail ─────────────────────────────────────

export const adminUserSearchQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminUserSearchQuery = z.infer<typeof adminUserSearchQuerySchema>;

export const adminUserRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

export const adminUserSearchResponseSchema = z.object({
  items: z.array(adminUserRowSchema),
  nextCursor: z.string().nullable(),
});
export type AdminUserSearchResponse = z.infer<typeof adminUserSearchResponseSchema>;

export const adminUserDetailTicketSchema = z.object({
  id: z.string().min(1),
  status: ticketStatusSchema,
  source: ticketSourceSchema,
  eventTitle: z.string(),
  createdAt: z.string().datetime(),
});

export const adminUserDetailOrderSchema = z.object({
  id: z.string().min(1),
  status: orderStatusSchema,
  amountCents: z.number().int(),
  currency: z.string().length(3),
  eventTitle: z.string(),
  createdAt: z.string().datetime(),
});

export const adminUserDetailSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  emailVerifiedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  bio: z.string().nullable(),
  city: z.string().nullable(),
  stateCode: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  stats: z.object({
    totalTickets: z.number().int().nonnegative(),
    totalOrders: z.number().int().nonnegative(),
  }),
  recentTickets: z.array(adminUserDetailTicketSchema),
  recentOrders: z.array(adminUserDetailOrderSchema),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

// ── Extras ──────────────────────────────────────────────────────────────

export const adminExtraSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string(),
  quantityTotal: z.number().int().nonnegative().nullable(),
  quantitySold: z.number().int().nonnegative(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminExtra = z.infer<typeof adminExtraSchema>;

export const adminExtraCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: optionalText(2000).optional(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3).default('BRL'),
  quantityTotal: z.number().int().nonnegative().nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});
export type AdminExtraCreate = z.infer<typeof adminExtraCreateSchema>;

export const adminExtraUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: optionalText(2000),
    priceCents: z.number().int().nonnegative(),
    quantityTotal: z.number().int().nonnegative().nullable(),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .partial()
  .strict();
export type AdminExtraUpdate = z.infer<typeof adminExtraUpdateSchema>;

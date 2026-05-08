import { z } from 'zod';

// The QR payload from F4: `<ticketId>.<base64url-sig>`. We do not try to
// parse it here — the server's verifyTicketCode is the source of truth.
// We just bound it to a sane length to reject obvious garbage early.
export const ticketCheckInRequestSchema = z.object({
  code: z.string().min(10).max(500),
  eventId: z.string().min(1).max(64),
});
export type TicketCheckInRequest = z.infer<typeof ticketCheckInRequestSchema>;

export const checkInResultSchema = z.enum(['admitted', 'already_used']);
export type CheckInResult = z.infer<typeof checkInResultSchema>;

export const checkInExtraItemSchema = z.object({
  id: z.string().min(1),
  extraId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  status: z.enum(['valid', 'used', 'revoked']),
  usedAt: z.string().datetime().nullable(),
});
export type CheckInExtraItem = z.infer<typeof checkInExtraItemSchema>;

// ── Store pickup (JDMA-393 check-in extension) ────────────────────────

export const storePickupItemSchema = z.object({
  id: z.string().min(1),
  productTitle: z.string().nullable(),
  variantName: z.string().nullable(),
  variantSku: z.string().nullable(),
  variantAttributes: z.record(z.string()).nullable(),
  quantity: z.number().int().positive(),
});
export type StorePickupItem = z.infer<typeof storePickupItemSchema>;

export const storePickupOrderSchema = z.object({
  orderId: z.string().min(1),
  shortId: z.string().min(1),
  fulfillmentStatus: z.enum(['unfulfilled', 'pickup_ready', 'picked_up', 'cancelled']),
  items: z.array(storePickupItemSchema),
});
export type StorePickupOrder = z.infer<typeof storePickupOrderSchema>;

export const pickupCollectRequestSchema = z.object({
  ticketId: z.string().min(1).max(64),
});
export type PickupCollectRequest = z.infer<typeof pickupCollectRequestSchema>;

export const pickupCollectResponseSchema = z.object({
  orders: z.array(
    z.object({
      orderId: z.string().min(1),
      shortId: z.string().min(1),
      collected: z.boolean(),
      fulfillmentStatus: z.enum(['unfulfilled', 'pickup_ready', 'picked_up', 'cancelled']),
      items: z.array(storePickupItemSchema),
    }),
  ),
});
export type PickupCollectResponse = z.infer<typeof pickupCollectResponseSchema>;

export const ticketCheckInResponseSchema = z.object({
  result: checkInResultSchema,
  ticket: z.object({
    id: z.string().min(1),
    status: z.enum(['valid', 'used', 'revoked']),
    checkedInAt: z.string().datetime(),
    tier: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    }),
    holder: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    }),
    car: z
      .object({
        make: z.string().min(1),
        model: z.string().min(1),
        year: z.number().int(),
      })
      .nullable(),
    licensePlate: z.string().nullable(),
    extras: z.array(checkInExtraItemSchema),
  }),
  storePickup: z.array(storePickupOrderSchema),
});
export type TicketCheckInResponse = z.infer<typeof ticketCheckInResponseSchema>;

export const checkInEventSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venueName: z.string().nullable(),
  city: z.string().min(1).nullable(),
  stateCode: z.string().length(2).nullable(),
});
export type CheckInEventSummary = z.infer<typeof checkInEventSummarySchema>;

export const checkInEventsResponseSchema = z.object({
  items: z.array(checkInEventSummarySchema),
});
export type CheckInEventsResponse = z.infer<typeof checkInEventsResponseSchema>;

// ── Extra claim (standalone extra QR or per-row claim button) ────────

export const extraClaimRequestSchema = z.object({
  code: z.string().min(10).max(500),
  eventId: z.string().min(1).max(64),
});
export type ExtraClaimRequest = z.infer<typeof extraClaimRequestSchema>;

export const extraClaimResultSchema = z.enum(['claimed', 'already_used']);
export type ExtraClaimResult = z.infer<typeof extraClaimResultSchema>;

export const extraClaimResponseSchema = z.object({
  result: extraClaimResultSchema,
  item: z.object({
    id: z.string().min(1),
    extraId: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(['valid', 'used', 'revoked']),
    usedAt: z.string().datetime().nullable(),
    holder: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    }),
    tier: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    }),
  }),
});
export type ExtraClaimResponse = z.infer<typeof extraClaimResponseSchema>;

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
});
export type TicketCheckInResponse = z.infer<typeof ticketCheckInResponseSchema>;

export const checkInEventSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venueName: z.string().nullable(),
  city: z.string().min(1),
  stateCode: z.string().length(2),
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

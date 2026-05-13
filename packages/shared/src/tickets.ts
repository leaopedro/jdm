import { z } from 'zod';

import { storePickupItemSchema } from './check-in.js';
import { eventSummarySchema } from './events.js';
import { ticketExtraItemStatusSchema } from './extras.js';

export const ticketStatusSchema = z.enum(['valid', 'used', 'revoked']);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketSourceSchema = z.enum(['purchase', 'premium_grant', 'comp']);
export type TicketSource = z.infer<typeof ticketSourceSchema>;

export const myTicketExtraSchema = z.object({
  id: z.string().min(1),
  extraId: z.string().min(1),
  extraName: z.string().min(1),
  code: z.string().min(1),
  status: ticketExtraItemStatusSchema,
  usedAt: z.string().datetime().nullable(),
});
export type MyTicketExtra = z.infer<typeof myTicketExtraSchema>;

export const myTicketPickupFulfillmentStatusSchema = z.enum([
  'unfulfilled',
  'pickup_ready',
  'picked_up',
  'cancelled',
]);
export type MyTicketPickupFulfillmentStatus = z.infer<typeof myTicketPickupFulfillmentStatusSchema>;

export const myTicketPickupOrderSchema = z.object({
  orderId: z.string().min(1),
  shortId: z.string().min(1),
  fulfillmentStatus: myTicketPickupFulfillmentStatusSchema,
  items: z.array(storePickupItemSchema),
});
export type MyTicketPickupOrder = z.infer<typeof myTicketPickupOrderSchema>;

export const myTicketSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  status: ticketStatusSchema,
  source: ticketSourceSchema,
  tierName: z.string().min(1),
  nickname: z.string().min(1).max(60).nullable().optional(),
  usedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  event: eventSummarySchema,
  extras: z.array(myTicketExtraSchema),
  pickupOrders: z.array(myTicketPickupOrderSchema),
});
export type MyTicket = z.infer<typeof myTicketSchema>;

export const myTicketsResponseSchema = z.object({
  items: z.array(myTicketSchema),
});
export type MyTicketsResponse = z.infer<typeof myTicketsResponseSchema>;

export const updateTicketRequestSchema = z.object({
  nickname: z.string().trim().min(1).max(60).nullable().optional(),
});
export type UpdateTicketRequest = z.infer<typeof updateTicketRequestSchema>;

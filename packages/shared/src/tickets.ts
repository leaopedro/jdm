import { z } from 'zod';

import { eventSummarySchema } from './events.js';

export const ticketStatusSchema = z.enum(['valid', 'used', 'revoked']);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketSourceSchema = z.enum(['purchase', 'premium_grant', 'comp']);
export type TicketSource = z.infer<typeof ticketSourceSchema>;

export const myTicketSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  status: ticketStatusSchema,
  source: ticketSourceSchema,
  tierName: z.string().min(1),
  usedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  event: eventSummarySchema,
});
export type MyTicket = z.infer<typeof myTicketSchema>;

export const myTicketsResponseSchema = z.object({
  items: z.array(myTicketSchema),
});
export type MyTicketsResponse = z.infer<typeof myTicketsResponseSchema>;

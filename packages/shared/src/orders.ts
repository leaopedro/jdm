import { z } from 'zod';

export const paymentMethodSchema = z.enum(['card', 'pix']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const orderStatusSchema = z.enum(['pending', 'paid', 'failed', 'refunded', 'expired']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

// Brazilian plate: old style ABC-1234 or new Mercosul ABC1D23 (dash optional)
export const licensePlateSchema = z
  .string()
  .regex(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/, 'invalid plate format');

export const ticketInputSchema = z.object({
  extras: z.array(z.string().min(1)).default([]),
  carId: z.string().min(1).optional(),
  licensePlate: licensePlateSchema.optional(),
});
export type TicketInput = z.infer<typeof ticketInputSchema>;

export const createOrderRequestSchema = z.object({
  eventId: z.string().min(1),
  tierId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  method: paymentMethodSchema,
  ticketId: z.string().min(1).optional(),
  // One ticket per order until maxTicketsPerUser is enforced server-side (JDMA-142)
  tickets: z.array(ticketInputSchema).min(1).max(1),
});
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

// clientSecret is returned only for card orders (Stripe). Pix uses a different shape in F4b.
// The mobile client reads its publishable key from EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
// not from this response, so it is intentionally omitted.
export const createOrderResponseSchema = z.object({
  orderId: z.string().min(1),
  status: orderStatusSchema,
  clientSecret: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

const httpsUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://') || u.startsWith('http://localhost'), {
    message: 'URL must use https (or http://localhost for dev)',
  });

export const createWebCheckoutRequestSchema = createOrderRequestSchema.extend({
  successUrl: httpsUrlSchema,
  cancelUrl: httpsUrlSchema,
});
export type CreateWebCheckoutRequest = z.infer<typeof createWebCheckoutRequestSchema>;

export const createWebCheckoutResponseSchema = z.object({
  orderId: z.string().min(1),
  status: orderStatusSchema,
  checkoutUrl: z.string().url(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type CreateWebCheckoutResponse = z.infer<typeof createWebCheckoutResponseSchema>;

export const getOrderResponseSchema = z.object({
  orderId: z.string().min(1),
  status: orderStatusSchema,
  expiresAt: z.string().datetime().nullable(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type GetOrderResponse = z.infer<typeof getOrderResponseSchema>;

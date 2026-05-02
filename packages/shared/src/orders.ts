import { z } from 'zod';

export const paymentMethodSchema = z.enum(['card', 'pix']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const orderStatusSchema = z.enum(['pending', 'paid', 'failed', 'refunded', 'expired']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const createOrderRequestSchema = z.object({
  eventId: z.string().min(1),
  tierId: z.string().min(1),
  method: paymentMethodSchema,
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

export const getOrderResponseSchema = z.object({
  orderId: z.string().min(1),
  status: orderStatusSchema,
  expiresAt: z.string().datetime().nullable(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type GetOrderResponse = z.infer<typeof getOrderResponseSchema>;

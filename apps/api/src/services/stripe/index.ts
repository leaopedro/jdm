import Stripe from 'stripe';

export type PaymentIntentResult = {
  id: string;
  clientSecret: string;
};

export type CreatePaymentIntentInput = {
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
};

export type WebhookEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export type StripeClient = {
  createPaymentIntent: (input: CreatePaymentIntentInput) => Promise<PaymentIntentResult>;
  constructWebhookEvent: (payload: Buffer, signature: string) => WebhookEvent;
  refund: (paymentIntentId: string, reason: string) => Promise<void>;
  publishableKey: () => string;
};

type StripeEnv = {
  readonly STRIPE_SECRET_KEY: string;
  readonly STRIPE_WEBHOOK_SECRET: string;
  readonly STRIPE_PUBLISHABLE_KEY?: string;
};

export const buildStripe = (env: StripeEnv): StripeClient => {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' });

  return {
    createPaymentIntent: async ({ amountCents, currency, metadata, idempotencyKey }) => {
      const pi = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: currency.toLowerCase(),
          metadata,
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey },
      );
      if (!pi.client_secret) throw new Error('stripe paymentIntent missing client_secret');
      return { id: pi.id, clientSecret: pi.client_secret };
    },
    constructWebhookEvent: (payload, signature) => {
      const event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
      return {
        id: event.id,
        type: event.type,
        data: { object: event.data.object as unknown as Record<string, unknown> },
      };
    },
    refund: async (paymentIntentId, reason) => {
      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        metadata: { reason },
      });
    },
    publishableKey: () => env.STRIPE_PUBLISHABLE_KEY ?? '',
  };
};

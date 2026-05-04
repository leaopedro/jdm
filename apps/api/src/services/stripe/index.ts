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

export type CheckoutSessionResult = {
  id: string;
  url: string;
  paymentIntentId: string | null;
};

export type CreateCheckoutSessionInput = {
  amountCents: number;
  currency: string;
  productName: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  expiresAt?: number;
};

export type WebhookEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export type StripeClient = {
  createPaymentIntent: (input: CreatePaymentIntentInput) => Promise<PaymentIntentResult>;
  createCheckoutSession: (input: CreateCheckoutSessionInput) => Promise<CheckoutSessionResult>;
  constructWebhookEvent: (payload: Buffer, signature: string) => Promise<WebhookEvent>;
  refund: (paymentIntentId: string, reason: string) => Promise<void>;
  cancelPaymentIntent: (paymentIntentId: string) => Promise<void>;
  publishableKey: () => string;
};

type StripeEnv = {
  readonly STRIPE_SECRET_KEY: string;
  readonly STRIPE_WEBHOOK_SECRET: string;
  readonly STRIPE_PUBLISHABLE_KEY?: string | undefined;
};

export const buildStripe = (env: StripeEnv): StripeClient => {
  // apiVersion is a string literal typed against stripe SDK's LatestApiVersion.
  // Bump in lockstep with the `stripe` package version; TS will reject stale values.
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' });

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
    createCheckoutSession: async ({
      amountCents,
      currency,
      productName,
      metadata,
      successUrl,
      cancelUrl,
      idempotencyKey,
      expiresAt,
    }) => {
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        payment_intent_data: { metadata },
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: amountCents,
              product_data: { name: productName },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { orderId: metadata.orderId ?? '' },
      };
      if (expiresAt) params.expires_at = expiresAt;
      const session = await stripe.checkout.sessions.create(params, { idempotencyKey });
      if (!session.url) throw new Error('stripe checkout session missing url');
      const piId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      return { id: session.id, url: session.url, paymentIntentId: piId };
    },
    constructWebhookEvent: async (payload, signature) => {
      try {
        const event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
        return {
          id: event.id,
          type: event.type,
          data: { object: event.data.object as unknown as Record<string, unknown> },
        };
      } catch (err) {
        const needsEventNotificationPath =
          err instanceof Error &&
          err.message.includes(
            'You passed an event notification to stripe.webhooks.constructEvent',
          );
        if (!needsEventNotificationPath) throw err;
      }

      const notification = stripe.parseEventNotification(
        payload,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      ) as Stripe.V2.Core.EventNotification | Stripe.V2.Core.Events.UnknownEventNotification;

      const normalizedType = notification.type.startsWith('v1.')
        ? notification.type.slice(3)
        : notification.type;

      // Pings and other control-plane notifications don't carry webhook payload data.
      if (normalizedType === 'v2.core.event_destination.ping') {
        return {
          id: notification.id,
          type: normalizedType,
          data: { object: notification as unknown as Record<string, unknown> },
        };
      }

      const fetched = await notification.fetchEvent();
      const fetchedData = (fetched as { data?: { object?: unknown } }).data?.object;
      const relatedObject =
        'fetchRelatedObject' in notification &&
        typeof notification.fetchRelatedObject === 'function'
          ? await notification.fetchRelatedObject()
          : null;
      const object =
        typeof fetchedData === 'object' && fetchedData !== null
          ? (fetchedData as Record<string, unknown>)
          : typeof relatedObject === 'object' && relatedObject !== null
            ? (relatedObject as Record<string, unknown>)
            : {};

      return {
        id: fetched.id,
        type: normalizedType,
        data: { object },
      };
    },
    // Stripe's refund.reason is a constrained enum; callers pass free-form text
    // which we persist in metadata, not in the enum field.
    refund: async (paymentIntentId, reason) => {
      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        metadata: { reason },
      });
    },
    cancelPaymentIntent: async (paymentIntentId) => {
      await stripe.paymentIntents.cancel(paymentIntentId);
    },
    // Mobile also reads its own EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY; server echo
    // is a convenience. Empty string is acceptable in dev/test; order-creating
    // routes in prod must validate non-empty before returning this to clients.
    publishableKey: () => env.STRIPE_PUBLISHABLE_KEY ?? '',
  };
};

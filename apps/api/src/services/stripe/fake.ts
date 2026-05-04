import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  CreatePaymentIntentInput,
  PaymentIntentResult,
  StripeClient,
  WebhookEvent,
} from './index.js';

type FakeCall = {
  kind: 'createPaymentIntent' | 'createCheckoutSession' | 'refund' | 'cancelPaymentIntent';
  payload: unknown;
};

export type FakeStripe = StripeClient & {
  calls: FakeCall[];
  nextPaymentIntent: { id: string; clientSecret: string };
  nextCheckoutSession: CheckoutSessionResult;
  nextCheckoutSessionPaymentIntentId: string | null;
  nextSignatureValid: boolean;
  nextEvent: WebhookEvent | null;
};

export const buildFakeStripe = (): FakeStripe => {
  const fake: FakeStripe = {
    calls: [],
    nextPaymentIntent: { id: 'pi_test_1', clientSecret: 'pi_test_1_secret_abc' },
    nextCheckoutSession: {
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/cs_test_1',
      paymentIntentId: 'pi_test_cs_1',
    },
    nextCheckoutSessionPaymentIntentId: 'pi_test_cs_1',
    nextSignatureValid: true,
    nextEvent: null,
    // eslint-disable-next-line @typescript-eslint/require-await
    createPaymentIntent: async (input: CreatePaymentIntentInput): Promise<PaymentIntentResult> => {
      fake.calls.push({ kind: 'createPaymentIntent', payload: input });
      return fake.nextPaymentIntent;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    createCheckoutSession: async (
      input: CreateCheckoutSessionInput,
    ): Promise<CheckoutSessionResult> => {
      fake.calls.push({ kind: 'createCheckoutSession', payload: input });
      return fake.nextCheckoutSession;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    getCheckoutSessionPaymentIntentId: async (_sessionId) => {
      return fake.nextCheckoutSessionPaymentIntentId;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    constructWebhookEvent: async (_payload, _signature) => {
      if (!fake.nextSignatureValid) {
        const err = new Error('signature verification failed');
        err.name = 'StripeSignatureVerificationError';
        throw err;
      }
      if (!fake.nextEvent) throw new Error('FakeStripe.nextEvent not set');
      return fake.nextEvent;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    refund: async (paymentIntentId, reason) => {
      fake.calls.push({ kind: 'refund', payload: { paymentIntentId, reason } });
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    cancelPaymentIntent: async (paymentIntentId) => {
      fake.calls.push({ kind: 'cancelPaymentIntent', payload: { paymentIntentId } });
    },
    publishableKey: () => 'pk_test_fake',
  };
  return fake;
};

import type {
  CreatePaymentIntentInput,
  PaymentIntentResult,
  StripeClient,
  WebhookEvent,
} from './index.js';

type FakeCall = {
  kind: 'createPaymentIntent' | 'refund' | 'cancelPaymentIntent';
  payload: unknown;
};

export type FakeStripe = StripeClient & {
  calls: FakeCall[];
  nextPaymentIntent: { id: string; clientSecret: string };
  nextSignatureValid: boolean;
  nextEvent: WebhookEvent | null;
};

export const buildFakeStripe = (): FakeStripe => {
  const fake: FakeStripe = {
    calls: [],
    nextPaymentIntent: { id: 'pi_test_1', clientSecret: 'pi_test_1_secret_abc' },
    nextSignatureValid: true,
    nextEvent: null,
    // eslint-disable-next-line @typescript-eslint/require-await
    createPaymentIntent: async (input: CreatePaymentIntentInput): Promise<PaymentIntentResult> => {
      fake.calls.push({ kind: 'createPaymentIntent', payload: input });
      return fake.nextPaymentIntent;
    },
    constructWebhookEvent: (_payload, _signature) => {
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

import { createHmac, timingSafeEqual } from 'node:crypto';

const BASE_URL = 'https://api.abacatepay.com/v2';

export type PixBillingResult = {
  id: string;
  brCode: string;
  expiresAt: string;
  status: string;
};

export type CreatePixBillingInput = {
  amountCents: number;
  externalId: string;
  description: string;
  metadata?: Record<string, string>;
};

export type PixBillingStatus = {
  id: string;
  status: string;
  paidAt: string | null;
};

export type AbacateWebhookEvent = {
  id: string;
  event: string;
  devMode: boolean;
  data: Record<string, unknown>;
};

export type AbacatePayClient = {
  createPixBilling: (input: CreatePixBillingInput) => Promise<PixBillingResult>;
  getPixBilling: (id: string) => Promise<PixBillingStatus>;
  verifyWebhookSignature: (payload: Buffer, signature: string) => void;
};

type AbacatePayEnv = {
  readonly ABACATEPAY_API_KEY: string;
  readonly ABACATEPAY_WEBHOOK_SECRET: string;
};

export const buildAbacatePay = (env: AbacatePayEnv): AbacatePayClient => {
  const headers = {
    Authorization: `Bearer ${env.ABACATEPAY_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const init: RequestInit = { method, headers };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AbacatePay ${method} ${path} failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { data: T; success: boolean; error: string | null };
    if (!json.success) throw new Error(`AbacatePay error: ${json.error}`);
    return json.data;
  };

  return {
    createPixBilling: async ({ amountCents, externalId, description, metadata }) => {
      const result = await request<{
        id: string;
        brCode: string;
        expiresAt: string;
        status: string;
      }>('POST', '/billing/pix/create', {
        amount: amountCents,
        externalId,
        description,
        metadata: metadata ?? {},
      });
      return result;
    },

    getPixBilling: async (id) => {
      const result = await request<{ id: string; status: string; paidAt: string | null }>(
        'GET',
        `/billing/pix/${id}`,
      );
      return result;
    },

    verifyWebhookSignature: (payload, signature) => {
      const expected = createHmac('sha256', env.ABACATEPAY_WEBHOOK_SECRET)
        .update(payload)
        .digest('base64');
      const a = Buffer.from(signature, 'base64');
      const b = Buffer.from(expected, 'base64');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new Error('invalid webhook signature');
      }
    },
  };
};

import { createOrderRequestSchema, createOrderResponseSchema } from '@jdm/shared/orders';
import type { CreateOrderRequest, CreateOrderResponse } from '@jdm/shared/orders';

import { authedRequest } from './client';

export const createOrder = (input: CreateOrderRequest): Promise<CreateOrderResponse> => {
  return authedRequest('/orders', createOrderResponseSchema, {
    method: 'POST',
    body: createOrderRequestSchema.parse(input),
  });
};

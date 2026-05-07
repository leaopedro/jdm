'use server';

import { adminStoreFulfillmentUpdateSchema } from '@jdm/shared/store';
import { revalidatePath } from 'next/cache';

import { updateAdminStoreOrderFulfillment } from './admin-api';
import { ApiError } from './api';
import type { StoreFormState } from './store-actions';

export const updateOrderFulfillmentAction = async (
  orderId: string,
  _prev: StoreFormState,
  fd: FormData,
): Promise<StoreFormState> => {
  const status = fd.get('status');
  const trackingCode = fd.get('trackingCode');
  const note = fd.get('note');
  const parsed = adminStoreFulfillmentUpdateSchema.safeParse({
    status,
    trackingCode: typeof trackingCode === 'string' ? trackingCode : undefined,
    note: typeof note === 'string' ? note : undefined,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  try {
    await updateAdminStoreOrderFulfillment(orderId, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: 'Erro ao atualizar fulfillment.' };
  }
  revalidatePath('/loja/pedidos');
  revalidatePath(`/loja/pedidos/${orderId}`);
  return { error: null };
};

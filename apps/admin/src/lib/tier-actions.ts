'use server';

import { adminTierCreateSchema, adminTierUpdateSchema } from '@jdm/shared/admin';
import { revalidatePath } from 'next/cache';

import { createTier, deleteTier, updateTier } from './admin-api.js';
import { ApiError } from './api.js';
import { toNumber } from './form-helpers.js';

export type TierFormState = { error: string | null };

export const createTierAction = async (
  eventId: string,
  _prev: TierFormState,
  fd: FormData,
): Promise<TierFormState> => {
  const parsed = adminTierCreateSchema.safeParse({
    name: fd.get('name'),
    priceCents: toNumber(fd.get('priceCents')),
    quantityTotal: toNumber(fd.get('quantityTotal')),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  try {
    await createTier(eventId, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: 'Erro ao criar tier.' };
  }
  revalidatePath(`/events/${eventId}`);
  return { error: null };
};

export const updateTierAction = async (
  eventId: string,
  tierId: string,
  _prev: TierFormState,
  fd: FormData,
): Promise<TierFormState> => {
  const raw: Record<string, unknown> = {};
  if (typeof fd.get('name') === 'string' && fd.get('name') !== '') raw.name = fd.get('name');
  const price = fd.get('priceCents');
  if (typeof price === 'string' && price !== '') raw.priceCents = Number(price);
  const qty = fd.get('quantityTotal');
  if (typeof qty === 'string' && qty !== '') raw.quantityTotal = Number(qty);

  const parsed = adminTierUpdateSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };
  try {
    await updateTier(eventId, tierId, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: 'Erro ao salvar tier.' };
  }
  revalidatePath(`/events/${eventId}`);
  return { error: null };
};

export const deleteTierAction = async (eventId: string, tierId: string): Promise<TierFormState> => {
  try {
    await deleteTier(eventId, tierId);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: 'Erro ao remover tier.' };
  }
  revalidatePath(`/events/${eventId}`);
  return { error: null };
};

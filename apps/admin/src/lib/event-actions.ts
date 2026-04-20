'use server';

import { adminEventCreateSchema, adminEventUpdateSchema } from '@jdm/shared/admin';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  cancelAdminEvent,
  createAdminEvent,
  publishAdminEvent,
  updateAdminEvent,
} from './admin-api.js';
import { ApiError } from './api.js';
import { toIso, toNumber } from './form-helpers.js';

export type EventFormState = { error: string | null };

export const createEventAction = async (
  _prev: EventFormState,
  fd: FormData,
): Promise<EventFormState> => {
  const parsed = adminEventCreateSchema.safeParse({
    slug: fd.get('slug'),
    title: fd.get('title'),
    description: fd.get('description'),
    coverObjectKey: (fd.get('coverObjectKey') as string) || null,
    startsAt: toIso(fd.get('startsAt')),
    endsAt: toIso(fd.get('endsAt')),
    venueName: fd.get('venueName'),
    venueAddress: fd.get('venueAddress'),
    lat: toNumber(fd.get('lat')),
    lng: toNumber(fd.get('lng')),
    city: fd.get('city'),
    stateCode: fd.get('stateCode'),
    type: fd.get('type'),
    capacity: toNumber(fd.get('capacity')),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  let created;
  try {
    created = await createAdminEvent(parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: 'Erro ao criar.' };
  }
  revalidatePath('/events');
  redirect(`/events/${created.id}`);
};

export const updateEventAction = async (
  id: string,
  _prev: EventFormState,
  fd: FormData,
): Promise<EventFormState> => {
  const raw: Record<string, unknown> = {};
  for (const key of [
    'title',
    'description',
    'venueName',
    'venueAddress',
    'city',
    'stateCode',
    'type',
  ]) {
    const v = fd.get(key);
    if (typeof v === 'string' && v !== '') raw[key] = v;
  }
  for (const key of ['lat', 'lng', 'capacity']) {
    const v = fd.get(key);
    if (typeof v === 'string' && v !== '') raw[key] = Number(v);
  }
  for (const key of ['startsAt', 'endsAt']) {
    const v = fd.get(key);
    if (typeof v === 'string' && v !== '') raw[key] = new Date(v).toISOString();
  }
  const coverKey = fd.get('coverObjectKey');
  if (typeof coverKey === 'string') raw.coverObjectKey = coverKey === '' ? null : coverKey;

  const parsed = adminEventUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  try {
    await updateAdminEvent(id, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: 'Erro ao salvar.' };
  }
  revalidatePath(`/events/${id}`);
  revalidatePath('/events');
  return { error: null };
};

export const publishEventAction = async (id: string): Promise<EventFormState> => {
  try {
    await publishAdminEvent(id);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: 'Erro ao publicar.' };
  }
  revalidatePath('/events');
  revalidatePath(`/events/${id}`);
  return { error: null };
};

export const cancelEventAction = async (id: string): Promise<EventFormState> => {
  try {
    await cancelAdminEvent(id);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: 'Erro ao cancelar.' };
  }
  revalidatePath('/events');
  revalidatePath(`/events/${id}`);
  return { error: null };
};

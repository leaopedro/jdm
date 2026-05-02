'use server';

import { adminEventCreateSchema, adminEventUpdateSchema } from '@jdm/shared/admin';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  cancelAdminEvent,
  createAdminEvent,
  publishAdminEvent,
  updateAdminEvent,
} from './admin-api';
import { ApiError } from './api';
import { toIso, toNumber } from './form-helpers';

// Values are echoed back to the form on error so the user does not have to
// re-type everything. React 19 resets form inputs after any <form action>
// settles; round-tripping the values via state + defaultValue is the
// simplest way to preserve them.
export type EventFormValues = Record<string, string>;
export type EventFormState = { error: string | null; values?: EventFormValues };

const captureValues = (fd: FormData): EventFormValues => {
  const out: EventFormValues = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
};

export const createEventAction = async (
  _prev: EventFormState,
  fd: FormData,
): Promise<EventFormState> => {
  const values = captureValues(fd);
  const parsed = adminEventCreateSchema.safeParse({
    slug: fd.get('slug'),
    title: fd.get('title'),
    description: fd.get('description'),
    coverObjectKey: (fd.get('coverObjectKey') as string) || null,
    startsAt: toIso(fd.get('startsAt')),
    endsAt: toIso(fd.get('endsAt')),
    venueName: fd.get('venueName'),
    venueAddress: fd.get('venueAddress'),
    city: fd.get('city'),
    stateCode: fd.get('stateCode'),
    type: fd.get('type'),
    capacity: toNumber(fd.get('capacity')),
    maxTicketsPerUser: toNumber(fd.get('maxTicketsPerUser')),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      values,
    };
  }
  let created;
  try {
    created = await createAdminEvent(parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message, values };
    return { error: 'Erro ao criar.', values };
  }
  revalidatePath('/events');
  redirect(`/events/${created.id}`);
};

export const updateEventAction = async (
  id: string,
  _prev: EventFormState,
  fd: FormData,
): Promise<EventFormState> => {
  const values = captureValues(fd);
  const raw: Record<string, unknown> = {};
  for (const key of ['title', 'description', 'venueName', 'venueAddress', 'city', 'type']) {
    const v = fd.get(key);
    if (typeof v === 'string') raw[key] = v;
  }
  // stateCode: empty-string -> null so the user can clear a previously set value.
  const stateCode = fd.get('stateCode');
  if (typeof stateCode === 'string') raw.stateCode = stateCode === '' ? null : stateCode;
  for (const key of ['capacity', 'maxTicketsPerUser']) {
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
      values,
    };
  }
  try {
    await updateAdminEvent(id, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message, values };
    return { error: 'Erro ao salvar.', values };
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

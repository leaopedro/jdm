'use server';

import {
  broadcastTargetSchema,
  createBroadcastRequestSchema,
  type BroadcastTarget,
  type CreateBroadcastRequest,
} from '@jdm/shared';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';

import { cancelAdminBroadcast, createAdminBroadcast, dryRunAdminBroadcast } from './admin-api';
import { ApiError } from './api';

export type BroadcastFormValues = Record<string, string>;
export type BroadcastFormState = {
  error: string | null;
  success: string | null;
  values?: BroadcastFormValues;
};

export type BroadcastDryRunState =
  | { ok: true; estimatedRecipients: number }
  | { ok: false; error: string };

const captureValues = (fd: FormData): BroadcastFormValues => {
  const out: BroadcastFormValues = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
};

const getTrimmedString = (value: FormDataEntryValue | null): string | null =>
  typeof value === 'string' ? value.trim() : null;

const parseTarget = (fd: FormData): BroadcastTarget => {
  const kind = fd.get('targetKind');
  if (kind === 'attendees_of_event') {
    return broadcastTargetSchema.parse({
      kind,
      eventId: fd.get('targetEventId'),
    });
  }
  if (kind === 'city') {
    const city = fd.get('targetCity');
    return broadcastTargetSchema.parse({
      kind,
      city: typeof city === 'string' ? city.trim() : '',
    });
  }
  return broadcastTargetSchema.parse({ kind });
};

const parseCreateInput = (fd: FormData): CreateBroadcastRequest =>
  (() => {
    const deliveryMode = fd.get('deliveryMode');
    let scheduledAt: string | undefined;
    if (deliveryMode === 'schedule') {
      const raw = fd.get('scheduledAt');
      if (typeof raw !== 'string' || raw.trim() === '') {
        throw new Error('Informe a data e hora do envio.');
      }
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) throw new Error('Informe uma data de envio válida.');
      if (parsed.getTime() <= Date.now()) throw new Error('O agendamento deve estar no futuro.');
      scheduledAt = parsed.toISOString();
    }

    const title = fd.get('title');
    const body = fd.get('body');
    return createBroadcastRequestSchema.parse({
      title: getTrimmedString(title) ?? title,
      body: getTrimmedString(body) ?? body,
      data: {},
      target: parseTarget(fd),
      scheduledAt,
      sendNow: deliveryMode === 'now' ? true : undefined,
    });
  })();

export const createBroadcastAction = async (
  _prev: BroadcastFormState,
  fd: FormData,
): Promise<BroadcastFormState> => {
  const values = captureValues(fd);

  let input: CreateBroadcastRequest;
  try {
    input = parseCreateInput(fd);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        error: error.issues.map((issue) => issue.message).join('; '),
        success: null,
        values,
      };
    }
    if (error instanceof Error) return { error: error.message, success: null, values };
    return { error: 'Dados inválidos para o broadcast.', success: null, values };
  }

  try {
    await createAdminBroadcast(input);
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message, success: null, values };
    return { error: 'Erro ao criar broadcast.', success: null, values };
  }

  revalidatePath('/broadcasts');
  return {
    error: null,
    success: input.sendNow ? 'Broadcast enviado para processamento.' : 'Broadcast agendado.',
  };
};

export const dryRunBroadcastAction = async (
  target: BroadcastTarget,
): Promise<BroadcastDryRunState> => {
  try {
    const parsed = broadcastTargetSchema.parse(target);
    const result = await dryRunAdminBroadcast({ target: parsed });
    return { ok: true, estimatedRecipients: result.estimatedRecipients };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    if (error instanceof Error) return { ok: false, error: error.message };
    return { ok: false, error: 'Não foi possível calcular o alcance.' };
  }
};

export const cancelBroadcastAction = async (id: string): Promise<{ error: string | null }> => {
  try {
    await cancelAdminBroadcast(id);
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    return { error: 'Erro ao cancelar broadcast.' };
  }

  revalidatePath('/broadcasts');
  return { error: null };
};

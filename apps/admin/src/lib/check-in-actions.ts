'use server';

import type {
  CheckInExtraItem,
  ExtraClaimResponse,
  TicketCheckInResponse,
} from '@jdm/shared/check-in';

import { checkInTicket as apiCheckInTicket, claimExtraItem as apiClaimExtra } from './admin-api';
import { ApiError } from './api';

export type CheckInActionResult =
  | {
      ok: true;
      result: 'admitted' | 'already_used';
      holder: string;
      tier: string;
      checkedInAt: string;
      car: { make: string; model: string; year: number } | null;
      licensePlate: string | null;
      extras: CheckInExtraItem[];
    }
  | { ok: false; error: string; message: string };

export const submitCheckIn = async (
  code: string,
  eventId: string,
): Promise<CheckInActionResult> => {
  try {
    const res: TicketCheckInResponse = await apiCheckInTicket({ code, eventId });
    return {
      ok: true,
      result: res.result,
      holder: res.ticket.holder.name,
      tier: res.ticket.tier.name,
      checkedInAt: res.ticket.checkedInAt,
      car: res.ticket.car ?? null,
      licensePlate: res.ticket.licensePlate ?? null,
      extras: res.ticket.extras,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.code, message: err.message };
    }
    return { ok: false, error: 'Unknown', message: 'erro inesperado' };
  }
};

export type ExtraClaimActionResult =
  | {
      ok: true;
      result: 'claimed' | 'already_used';
      name: string;
      holder: string;
      tier: string;
      usedAt: string | null;
    }
  | { ok: false; error: string; message: string };

export const submitExtraClaim = async (
  code: string,
  eventId: string,
): Promise<ExtraClaimActionResult> => {
  try {
    const res: ExtraClaimResponse = await apiClaimExtra({ code, eventId });
    return {
      ok: true,
      result: res.result,
      name: res.item.name,
      holder: res.item.holder.name,
      tier: res.item.tier.name,
      usedAt: res.item.usedAt,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.code, message: err.message };
    }
    return { ok: false, error: 'Unknown', message: 'erro inesperado' };
  }
};

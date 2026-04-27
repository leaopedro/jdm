'use server';

import { checkInTicket as apiCheckInTicket } from './admin-api';
import { ApiError } from './api';

export type CheckInActionResult =
  | {
      ok: true;
      result: 'admitted' | 'already_used';
      holder: string;
      tier: string;
      checkedInAt: string;
    }
  | { ok: false; error: string; message: string };

export const submitCheckIn = async (
  code: string,
  eventId: string,
): Promise<CheckInActionResult> => {
  try {
    const res = await apiCheckInTicket({ code, eventId });
    return {
      ok: true,
      result: res.result,
      holder: res.ticket.holder.name,
      tier: res.ticket.tier.name,
      checkedInAt: res.ticket.checkedInAt,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.code, message: err.message };
    }
    return { ok: false, error: 'Unknown', message: 'erro inesperado' };
  }
};

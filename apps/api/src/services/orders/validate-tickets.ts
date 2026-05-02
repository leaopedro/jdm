import type { Prisma } from '@jdm/db';
import type { TicketInput } from '@jdm/shared/orders';

export interface TicketValidationResult {
  totalExtrasCents: number;
  /** One entry per ticket-extra pair, for OrderExtra row creation */
  extraEntries: { extraId: string; priceCents: number }[];
  /** Compact tickets array packed into Stripe PI metadata */
  ticketsMetadata: { e: string[]; c?: string; p?: string }[];
  /** For CAS reservation inside transaction */
  extraStock: { id: string; quantityTotal: number }[];
}

type Tx = Prisma.TransactionClient;

/**
 * Validates per-ticket inputs within a transaction.
 *
 * Enforces (throws coded errors for route to map to HTTP status):
 * - `MISSING_CAR_ID`   → 422 when tier.requiresCar and carId absent
 * - `DUPLICATE_EXTRA`  → 422 when same extraId appears twice in one ticket
 * - `EXTRA_NOT_FOUND`  → 404 when extraId doesn't exist or belongs to another event
 * - `EXTRA_SOLD_OUT`   → 409 when extra has no available stock
 */
export async function validateTickets(
  tickets: TicketInput[],
  tier: { requiresCar: boolean },
  eventId: string,
  tx: Tx,
): Promise<TicketValidationResult> {
  const allExtraIds = new Set<string>();

  for (const ticket of tickets) {
    if (tier.requiresCar && !ticket.carId) {
      throw Object.assign(new Error('carId required for this tier'), { code: 'MISSING_CAR_ID' });
    }
    const seen = new Set<string>();
    for (const extraId of ticket.extras ?? []) {
      if (seen.has(extraId)) {
        throw Object.assign(new Error(`duplicate extra ${extraId} in same ticket`), {
          code: 'DUPLICATE_EXTRA',
        });
      }
      seen.add(extraId);
      allExtraIds.add(extraId);
    }
  }

  if (allExtraIds.size === 0) {
    return {
      totalExtrasCents: 0,
      extraEntries: [],
      ticketsMetadata: tickets.map((t) => ({
        e: [] as string[],
        ...(t.carId ? { c: t.carId } : {}),
        ...(t.licensePlate ? { p: t.licensePlate } : {}),
      })),
      extraStock: [],
    };
  }

  const extras = await tx.ticketExtra.findMany({
    where: { id: { in: [...allExtraIds] } },
    select: { id: true, eventId: true, priceCents: true, quantityTotal: true, quantitySold: true },
  });

  const extrasById = new Map(extras.map((e) => [e.id, e]));

  for (const extraId of allExtraIds) {
    const extra = extrasById.get(extraId);
    if (!extra || extra.eventId !== eventId) {
      throw Object.assign(new Error(`extra ${extraId} not found for this event`), {
        code: 'EXTRA_NOT_FOUND',
      });
    }
    if (extra.quantitySold >= extra.quantityTotal) {
      throw Object.assign(new Error(`extra ${extraId} is sold out`), { code: 'EXTRA_SOLD_OUT' });
    }
  }

  let totalExtrasCents = 0;
  const extraEntries: { extraId: string; priceCents: number }[] = [];

  const ticketsMetadata = tickets.map((ticket) => {
    const extraIds = ticket.extras ?? [];
    for (const extraId of extraIds) {
      const extra = extrasById.get(extraId)!;
      totalExtrasCents += extra.priceCents;
      extraEntries.push({ extraId, priceCents: extra.priceCents });
    }
    return {
      e: extraIds,
      ...(ticket.carId ? { c: ticket.carId } : {}),
      ...(ticket.licensePlate ? { p: ticket.licensePlate } : {}),
    };
  });

  const extraStock = extras.map((e) => ({ id: e.id, quantityTotal: e.quantityTotal }));

  return { totalExtrasCents, extraEntries, ticketsMetadata, extraStock };
}

/**
 * CAS-increments quantitySold for each unique extra.
 * Returns false if any extra was sold out between validation and reservation (race condition).
 */
export async function reserveExtras(
  extraStock: { id: string; quantityTotal: number }[],
  tx: Tx,
): Promise<boolean> {
  if (extraStock.length === 0) return true;
  for (const { id, quantityTotal } of extraStock) {
    const result = await tx.ticketExtra.updateMany({
      where: { id, quantitySold: { lt: quantityTotal } },
      data: { quantitySold: { increment: 1 } },
    });
    if (result.count === 0) return false;
  }
  return true;
}

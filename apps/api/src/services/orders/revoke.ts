import { prisma } from '@jdm/db';

export const revokeTicketsForRefundedOrder = async (orderId: string): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const tickets = await tx.ticket.findMany({
      where: { orderId, status: 'valid' },
      select: { id: true },
    });
    if (tickets.length === 0) return;

    const ticketIds = tickets.map((t) => t.id);

    await tx.ticket.updateMany({
      where: { id: { in: ticketIds }, status: 'valid' },
      data: { status: 'revoked' },
    });

    await tx.ticketExtraItem.updateMany({
      where: { ticketId: { in: ticketIds }, status: 'valid' },
      data: { status: 'revoked' },
    });

    await tx.pickupVoucher.updateMany({
      where: { orderId, status: 'valid' },
      data: { status: 'revoked' },
    });
  });
};

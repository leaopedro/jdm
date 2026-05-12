import { prisma } from '@jdm/db';
import type { BroadcastTarget } from '@jdm/shared';

export type RecipientRow = {
  userId: string;
  tokens: string[];
};

/**
 * Resolve eligible recipients for a broadcast target.
 * Excludes users with pushPrefs.marketing = false or no device tokens.
 */
export const resolveRecipients = async (target: BroadcastTarget): Promise<RecipientRow[]> => {
  let userIds: string[];

  if (target.kind === 'all') {
    const users = await prisma.user.findMany({
      where: { status: 'active', role: 'user' },
      select: { id: true },
    });
    userIds = users.map((u) => u.id);
  } else if (target.kind === 'premium') {
    const tickets = await prisma.ticket.findMany({
      where: { source: 'premium_grant', status: 'valid' },
      select: { userId: true },
      distinct: ['userId'],
    });
    userIds = tickets.map((t) => t.userId);
  } else if (target.kind === 'attendees_of_event') {
    const tickets = await prisma.ticket.findMany({
      where: { eventId: target.eventId, status: { in: ['valid', 'used'] } },
      select: { userId: true },
      distinct: ['userId'],
    });
    userIds = tickets.map((t) => t.userId);
  } else {
    // city
    const users = await prisma.user.findMany({
      where: { city: target.city, status: 'active', role: 'user' },
      select: { id: true },
    });
    userIds = users.map((u) => u.id);
  }

  if (userIds.length === 0) return [];

  const rows = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      status: 'active',
    },
    select: {
      id: true,
      pushPrefs: true,
      deviceTokens: { select: { expoPushToken: true } },
    },
  });

  return rows
    .filter((u) => {
      const prefs = u.pushPrefs as { marketing?: boolean } | null;
      return prefs?.marketing !== false;
    })
    .filter((u) => u.deviceTokens.length > 0)
    .map((u) => ({
      userId: u.id,
      tokens: u.deviceTokens.map((dt) => dt.expoPushToken),
    }));
};

export const countRecipients = async (target: BroadcastTarget): Promise<number> => {
  const recipients = await resolveRecipients(target);
  return recipients.length;
};

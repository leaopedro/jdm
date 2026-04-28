import { prisma } from '@jdm/db';
import type { PushKind } from '@jdm/shared/push';
import { Prisma } from '@prisma/client';

import type { PushMessage, PushSender } from './types.js';

export type SendTransactionalPushInput = {
  userId: string;
  kind: PushKind;
  dedupeKey: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type SendTransactionalPushResult = {
  deduped: boolean;
  sent: number;
  invalidatedTokens: number;
};

export const sendTransactionalPush = async (
  input: SendTransactionalPushInput,
  deps: { sender: PushSender },
): Promise<SendTransactionalPushResult> => {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        title: input.title,
        body: input.body,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { deduped: true, sent: 0, invalidatedTokens: 0 };
    }
    throw err;
  }

  const tokens = await prisma.deviceToken.findMany({
    where: { userId: input.userId },
    select: { expoPushToken: true },
  });
  if (tokens.length === 0) {
    return { deduped: false, sent: 0, invalidatedTokens: 0 };
  }

  const result = await deps.sender.send(
    tokens.map((t) => {
      const message: PushMessage = {
        to: t.expoPushToken,
        title: input.title,
        body: input.body,
      };
      if (input.data !== undefined) message.data = input.data;
      return message;
    }),
  );

  let sent = 0;
  const invalid: string[] = [];
  for (const [token, outcome] of result.outcomesByToken) {
    if (outcome.kind === 'ok') sent += 1;
    else if (outcome.kind === 'invalid-token') invalid.push(token);
  }

  if (invalid.length > 0) {
    await prisma.deviceToken.deleteMany({
      where: { userId: input.userId, expoPushToken: { in: invalid } },
    });
  }

  await prisma.notification.updateMany({
    where: { userId: input.userId, kind: input.kind, dedupeKey: input.dedupeKey },
    data: { sentAt: new Date() },
  });

  return { deduped: false, sent, invalidatedTokens: invalid.length };
};

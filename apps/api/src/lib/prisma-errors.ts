import { Prisma } from '@prisma/client';

export const isUniqueConstraintError = (err: unknown): boolean => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2002';
  }
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const candidate = err as { code?: unknown; message?: unknown };
  return (
    candidate.code === 'P2002' ||
    (typeof candidate.message === 'string' &&
      candidate.message.includes('Unique constraint failed'))
  );
};

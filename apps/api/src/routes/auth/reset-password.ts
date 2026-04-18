import { prisma } from '@jdm/db';
import { resetPasswordSchema } from '@jdm/shared/auth';
import type { FastifyPluginAsync } from 'fastify';

import { consumePasswordResetToken } from '../../services/auth/password-reset.js';
import { hashPassword } from '../../services/auth/password.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const resetPasswordRoute: FastifyPluginAsync = async (app) => {
  app.post('/reset-password', async (request, reply) => {
    const { token, password } = resetPasswordSchema.parse(request.body);
    const consumed = await consumePasswordResetToken(token);
    if (!consumed) {
      return reply.status(400).send({ error: 'BadRequest', message: 'invalid or expired token' });
    }
    const hash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: consumed.userId }, data: { passwordHash: hash } }),
      prisma.refreshToken.updateMany({
        where: { userId: consumed.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return reply.status(200).send({ message: 'password updated' });
  });
};

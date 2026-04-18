import { prisma } from '@jdm/db';
import { authResponseSchema, signupSchema } from '@jdm/shared/auth';
import type { FastifyPluginAsync } from 'fastify';

import { verificationMail } from '../../services/auth/mail-templates.js';
import { hashPassword } from '../../services/auth/password.js';
import { createAccessToken, issueRefreshToken } from '../../services/auth/tokens.js';
import { issueVerificationToken } from '../../services/auth/verification.js';

// Signup intentionally returns an access+refresh pair so mobile can navigate
// straight to the verify-email-pending screen without a separate login round
// trip. The access token is usable for ~15m while emailVerifiedAt is null —
// `/auth/login` gates on verification, and any verified-email-required
// endpoints MUST re-check `user.emailVerifiedAt` rather than trust the JWT.
// eslint-disable-next-line @typescript-eslint/require-await
export const signupRoute: FastifyPluginAsync = async (app) => {
  app.post('/signup', async (request, reply) => {
    const input = signupSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      return reply.status(409).send({ error: 'Conflict', message: 'email already registered' });
    }

    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      },
    });

    const verifyToken = await issueVerificationToken(user.id);
    const link = `${app.env.APP_WEB_BASE_URL}/verify?token=${encodeURIComponent(verifyToken)}`;
    await app.mailer.send(verificationMail(user.email, link));

    const access = createAccessToken({ sub: user.id, role: user.role }, app.env);
    const refresh = issueRefreshToken(app.env);
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: refresh.hash, expiresAt: refresh.expiresAt },
    });

    return reply.status(201).send(
      authResponseSchema.parse({
        accessToken: access,
        refreshToken: refresh.token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerifiedAt: null,
          createdAt: user.createdAt.toISOString(),
        },
      }),
    );
  });
};

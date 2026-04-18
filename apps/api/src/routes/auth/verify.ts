import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { consumeVerificationToken } from '../../services/auth/verification.js';

const querySchema = z.object({ token: z.string().min(10) });

// eslint-disable-next-line @typescript-eslint/require-await
export const verifyRoute: FastifyPluginAsync = async (app) => {
  app.get('/verify', async (request, reply) => {
    const { token } = querySchema.parse(request.query);
    const result = await consumeVerificationToken(token);
    if (!result) {
      return reply.status(400).send({ error: 'BadRequest', message: 'invalid or expired token' });
    }
    return reply.status(200).send({ message: 'email verified' });
  });
};

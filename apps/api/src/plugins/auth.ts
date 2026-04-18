import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { verifyAccessToken, type AccessPayload } from '../services/auth/tokens.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: AccessPayload;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
export const authPlugin = fp(async (app) => {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'missing bearer token' });
    }
    const token = header.slice('Bearer '.length);
    try {
      request.user = verifyAccessToken(token, app.env);
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'invalid token' });
    }
    return undefined;
  });
});

import type { FastifyPluginAsync } from 'fastify';

import { signupRoute } from './signup.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  await app.register(signupRoute);
};

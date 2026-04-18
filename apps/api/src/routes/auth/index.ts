import type { FastifyPluginAsync } from 'fastify';

import { loginRoute } from './login.js';
import { resendVerifyRoute } from './resend-verify.js';
import { signupRoute } from './signup.js';
import { verifyRoute } from './verify.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  await app.register(signupRoute);
  await app.register(verifyRoute);
  await app.register(resendVerifyRoute);
  await app.register(loginRoute);
};

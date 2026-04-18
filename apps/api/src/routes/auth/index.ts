import type { FastifyPluginAsync } from 'fastify';

import { forgotPasswordRoute } from './forgot-password.js';
import { loginRoute } from './login.js';
import { logoutRoute } from './logout.js';
import { refreshRoute } from './refresh.js';
import { resendVerifyRoute } from './resend-verify.js';
import { signupRoute } from './signup.js';
import { verifyRoute } from './verify.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  await app.register(signupRoute);
  await app.register(verifyRoute);
  await app.register(resendVerifyRoute);
  await app.register(loginRoute);
  await app.register(refreshRoute);
  await app.register(logoutRoute);
  await app.register(forgotPasswordRoute);
};

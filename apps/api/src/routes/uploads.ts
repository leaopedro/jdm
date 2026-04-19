import { presignRequestSchema } from '@jdm/shared/uploads';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post('/uploads/presign', { preHandler: [app.authenticate] }, async (request, _reply) => {
    const { sub } = requireUser(request);
    const { kind, contentType, size } = presignRequestSchema.parse(request.body);
    const result = await app.uploads.presignPut({ kind, userId: sub, contentType, size });
    return {
      uploadUrl: result.uploadUrl,
      objectKey: result.objectKey,
      publicUrl: result.publicUrl,
      expiresAt: result.expiresAt.toISOString(),
      headers: result.headers,
    };
  });
};

import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import {
  createExportJob,
  getExportJob,
  listExportJobs,
  buildSignedDownloadUrl,
  getR2ConfigFromEnv,
} from '../services/data-export.js';

export const meDataExportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me/data-export', { preHandler: [app.authenticate] }, async (request) => {
    const { sub } = requireUser(request);
    const jobs = await listExportJobs(sub);
    return {
      items: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        expiresAt: j.expiresAt?.toISOString() ?? null,
        createdAt: j.createdAt.toISOString(),
        completedAt: j.completedAt?.toISOString() ?? null,
      })),
    };
  });

  app.get<{ Params: { id: string } }>(
    '/me/data-export/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sub } = requireUser(request);
      const { id } = request.params;
      const job = await getExportJob(id, sub);
      if (!job) return reply.status(404).send({ error: 'NotFound' });

      let downloadUrl: string | null = null;
      const notExpired = job.expiresAt && job.expiresAt.getTime() > Date.now();
      if (job.status === 'completed' && job.objectKey && notExpired) {
        const r2Config = getR2ConfigFromEnv(app.env);
        if (r2Config) {
          downloadUrl = await buildSignedDownloadUrl(r2Config, job.objectKey);
        }
      }

      return {
        id: job.id,
        status: job.status,
        downloadUrl,
        expiresAt: job.expiresAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
        errorMessage: job.errorMessage,
      };
    },
  );

  await app.register(async (scoped) => {
    await scoped.register(rateLimit, { max: 3, timeWindow: '1 hour' });

    scoped.post(
      '/me/data-export',
      { preHandler: [scoped.authenticate] },
      async (request, reply) => {
        const { sub } = requireUser(request);
        const { id, status } = await createExportJob(sub);

        if (status === 'processing') {
          return reply.status(200).send({ id, status, message: 'Export already in progress' });
        }

        return reply.status(202).send({ id, status });
      },
    );
  });
};

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';

import type { FastifyPluginAsync } from 'fastify';

const UPLOAD_DIR = join(tmpdir(), 'jdm-dev-uploads');

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// eslint-disable-next-line @typescript-eslint/require-await
export const devUploadRoutes: FastifyPluginAsync = async (app) => {
  // Fastify only parses application/json by default; image bodies need explicit parsers.
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  app.put('/dev-uploads/put/*', async (request, reply) => {
    const objectKey = (request.params as { '*': string })['*'];
    const dest = join(UPLOAD_DIR, objectKey);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, request.body as Buffer);
    return reply.status(200).send();
  });

  app.get('/dev-uploads/*', async (request, reply) => {
    const objectKey = (request.params as { '*': string })['*'];
    const filePath = join(UPLOAD_DIR, objectKey);
    const ext = extname(filePath).slice(1).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    try {
      const data = await readFile(filePath);
      return reply.header('content-type', mime).send(data);
    } catch {
      return reply.status(404).send({ error: 'NotFound' });
    }
  });
};

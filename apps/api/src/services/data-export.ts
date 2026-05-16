import { PutObjectCommand, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '@jdm/db';

import type { Env } from '../env.js';

const EXPORT_EXPIRY_DAYS = 7;
const EXPORT_EXPIRY_MS = EXPORT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export type DataExportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ExportManifestEntity = {
  entity: string;
  count: number;
};

export type ExportManifest = {
  version: '1.0';
  exportedAt: string;
  userId: string;
  expiresAt: string;
  entities: ExportManifestEntity[];
};

export type ExportBundle = {
  manifest: ExportManifest;
  data: Record<string, unknown[]>;
};

export type ExportJobSummary = {
  id: string;
  status: DataExportJobStatus;
  expiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type ExportJobDetail = ExportJobSummary & {
  objectKey: string | null;
  errorMessage: string | null;
};

const collectUserData = async (userId: string): Promise<ExportBundle> => {
  const [
    user,
    cars,
    tickets,
    orders,
    shippingAddresses,
    supportTickets,
    feedPosts,
    feedComments,
    feedReactions,
    deviceTokens,
    consents,
    notifications,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        bio: true,
        city: true,
        stateCode: true,
        pushPrefs: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.car.findMany({
      where: { userId },
      include: { photos: { select: { id: true, objectKey: true, sortOrder: true } } },
    }),
    prisma.ticket.findMany({
      where: { userId },
      select: {
        id: true,
        eventId: true,
        tierId: true,
        carId: true,
        licensePlate: true,
        nickname: true,
        source: true,
        status: true,
        usedAt: true,
        createdAt: true,
      },
    }),
    prisma.order.findMany({
      where: { userId },
      include: {
        orderExtras: { select: { id: true, extraId: true, quantity: true } },
        items: {
          select: {
            id: true,
            kind: true,
            variantId: true,
            tierId: true,
            extraId: true,
            eventId: true,
            quantity: true,
            unitPriceCents: true,
            subtotalCents: true,
          },
        },
      },
    }),
    prisma.shippingAddress.findMany({ where: { userId } }),
    prisma.supportTicket.findMany({
      where: { userId },
      select: {
        id: true,
        phone: true,
        message: true,
        status: true,
        internalStatus: true,
        createdAt: true,
        closedAt: true,
      },
    }),
    prisma.feedPost.findMany({
      where: { authorUserId: userId },
      select: {
        id: true,
        eventId: true,
        carId: true,
        body: true,
        status: true,
        createdAt: true,
        photos: { select: { id: true, objectKey: true, sortOrder: true } },
      },
    }),
    prisma.feedComment.findMany({
      where: { authorUserId: userId },
      select: {
        id: true,
        postId: true,
        carId: true,
        body: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.feedReaction.findMany({
      where: { userId },
      select: { id: true, postId: true, kind: true, createdAt: true },
    }),
    prisma.deviceToken.findMany({
      where: { userId },
      select: {
        id: true,
        expoPushToken: true,
        platform: true,
        lastSeenAt: true,
        createdAt: true,
      },
    }),
    prisma.consent.findMany({
      where: { userId },
      select: {
        id: true,
        purpose: true,
        version: true,
        givenAt: true,
        withdrawnAt: true,
        channel: true,
      },
    }),
    prisma.notification.findMany({
      where: { userId },
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        data: true,
        sentAt: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPORT_EXPIRY_MS);

  const data: Record<string, unknown[]> = {
    user: user ? [user] : [],
    cars,
    tickets,
    orders,
    shippingAddresses,
    supportTickets,
    feedPosts,
    feedComments,
    feedReactions,
    deviceTokens,
    consents,
    notifications,
  };

  const entities: ExportManifestEntity[] = Object.entries(data).map(([entity, rows]) => ({
    entity,
    count: rows.length,
  }));

  return {
    manifest: {
      version: '1.0',
      exportedAt: now.toISOString(),
      userId,
      expiresAt: expiresAt.toISOString(),
      entities,
    },
    data,
  };
};

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

const buildR2Client = (config: R2Config) =>
  new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

const uploadBundle = async (
  client: S3Client,
  bucket: string,
  userId: string,
  jobId: string,
  bundle: ExportBundle,
): Promise<string> => {
  const objectKey = `data-export/${userId}/${jobId}.json`;
  const body = JSON.stringify(bundle, null, 2);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: body,
      ContentType: 'application/json',
      ContentDisposition: `attachment; filename="jdm-data-export-${jobId}.json"`,
    }),
  );

  return objectKey;
};

export const buildSignedDownloadUrl = async (
  config: R2Config,
  objectKey: string,
): Promise<string> => {
  const client = buildR2Client(config);
  const command = new GetObjectCommand({ Bucket: config.bucket, Key: objectKey });
  return getSignedUrl(client, command, { expiresIn: EXPORT_EXPIRY_DAYS * 24 * 60 * 60 });
};

export const getR2ConfigFromEnv = (env: Env): R2Config | null => {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) {
    return null;
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  };
};

export const processExportJob = async (jobId: string, env: Env): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const job = (await (prisma as any).dataExportJob.findUnique({ where: { id: jobId } })) as {
    id: string;
    userId: string;
    status: DataExportJobStatus;
  } | null;
  if (!job || job.status !== 'pending') return;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  await (prisma as any).dataExportJob.update({
    where: { id: jobId },
    data: { status: 'processing', startedAt: new Date() },
  });

  try {
    const bundle = await collectUserData(job.userId);
    const r2Config = getR2ConfigFromEnv(env);

    let objectKey: string;
    if (r2Config) {
      const client = buildR2Client(r2Config);
      objectKey = await uploadBundle(client, r2Config.bucket, job.userId, jobId, bundle);
    } else {
      objectKey = `data-export/${job.userId}/${jobId}.json`;
    }

    const expiresAt = new Date(Date.now() + EXPORT_EXPIRY_MS);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    await (prisma as any).dataExportJob.update({
      where: { id: jobId },
      data: { status: 'completed', objectKey, expiresAt, completedAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    await (prisma as any).dataExportJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: message.slice(0, 500),
        completedAt: new Date(),
      },
    });
  }
};

export const createExportJob = async (
  userId: string,
): Promise<{ id: string; status: DataExportJobStatus }> => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const recent = (await (prisma as any).dataExportJob.findFirst({
    where: {
      userId,
      status: { in: ['pending', 'processing'] },
    },
    orderBy: { createdAt: 'desc' },
  })) as { id: string; status: DataExportJobStatus } | null;
  if (recent) return { id: recent.id, status: recent.status };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const job = (await (prisma as any).dataExportJob.create({
    data: { userId },
  })) as { id: string; status: DataExportJobStatus };
  return { id: job.id, status: job.status };
};

export const getExportJob = async (
  jobId: string,
  userId: string,
): Promise<ExportJobDetail | null> => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const row = (await (prisma as any).dataExportJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      status: true,
      objectKey: true,
      expiresAt: true,
      createdAt: true,
      completedAt: true,
      errorMessage: true,
    },
  })) as ExportJobDetail | null;
  return row;
};

export const listExportJobs = async (userId: string): Promise<ExportJobSummary[]> => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const rows = (await (prisma as any).dataExportJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      completedAt: true,
    },
  })) as ExportJobSummary[];
  return rows;
};

export { collectUserData as _collectUserDataForTest };

import { createId } from '@paralleldrive/cuid2';

import type { PresignInput, PresignResult, UploadKind, Uploads } from './types.js';
import { EXT_FOR_MIME } from './types.js';

export class DevUploads implements Uploads {
  constructor(
    private readonly publicBase = 'http://localhost:4000/dev-uploads',
    private readonly ttlSeconds = 300,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async presignPut(input: PresignInput): Promise<PresignResult> {
    const ext = EXT_FOR_MIME[input.contentType] ?? 'bin';
    const objectKey = `${input.kind}/${input.userId}/${createId()}.${ext}`;
    return {
      uploadUrl: `${this.publicBase}/put/${objectKey}`,
      objectKey,
      publicUrl: this.buildPublicUrl(objectKey),
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
      headers: { 'content-type': input.contentType },
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async presignGet(objectKey: string): Promise<string> {
    return this.buildPublicUrl(objectKey);
  }

  buildPublicUrl(objectKey: string): string {
    return `${this.publicBase}/${objectKey}`;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async buildSignedGetUrl(objectKey: string, ttlSeconds = this.ttlSeconds): Promise<string> {
    return `${this.publicBase}/${objectKey}?signed=dev&exp=${Date.now() + ttlSeconds * 1000}`;
  }

  isOwnedKey(objectKey: string, userId: string, kind: UploadKind): boolean {
    return objectKey.startsWith(`${kind}/${userId}/`);
  }

  async deleteObject(_objectKey: string): Promise<void> {
    // no-op in dev
  }
}

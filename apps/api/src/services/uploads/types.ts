export type UploadKind =
  | 'avatar'
  | 'car_photo'
  | 'event_cover'
  | 'product_photo'
  | 'support_attachment';

export type PresignInput = {
  kind: UploadKind;
  userId: string;
  contentType: string;
  size: number;
};

export type PresignResult = {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresAt: Date;
  headers: Record<string, string>;
};

export interface Uploads {
  presignPut(input: PresignInput): Promise<PresignResult>;
  presignGet(objectKey: string): Promise<string>;
  buildPublicUrl(objectKey: string): string;
  buildSignedGetUrl(objectKey: string, ttlSeconds?: number): Promise<string>;
  isOwnedKey(objectKey: string, userId: string, kind: UploadKind): boolean;
  deleteObject(objectKey: string): Promise<void>;
}

export const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

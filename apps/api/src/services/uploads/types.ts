export type PresignInput = {
  kind: 'avatar' | 'car_photo' | 'event_cover';
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
  buildPublicUrl(objectKey: string): string;
  isOwnedKey(
    objectKey: string,
    userId: string,
    kind: 'avatar' | 'car_photo' | 'event_cover',
  ): boolean;
  deleteObject(objectKey: string): Promise<void>;
}

export const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

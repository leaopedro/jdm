import {
  presignRequestSchema,
  presignResponseSchema,
  type PresignRequest,
  type PresignResponse,
} from '@jdm/shared/uploads';

import { authedRequest } from './client';

export const requestPresign = (input: PresignRequest): Promise<PresignResponse> => {
  const parsed = presignRequestSchema.parse(input);
  return authedRequest('/uploads/presign', presignResponseSchema, {
    method: 'POST',
    body: parsed,
  });
};

import {
  authResponseSchema,
  type AuthResponse,
  type ForgotPasswordInput,
  type LoginInput,
  type ResendVerifyInput,
  type ResetPasswordInput,
  type SignupInput,
  messageResponseSchema,
  type MessageResponse,
  publicUserSchema,
  type PublicUser,
} from '@jdm/shared/auth';

import { authedRequest, request } from './client';

export const signupRequest = (input: SignupInput): Promise<AuthResponse> =>
  request('/auth/signup', authResponseSchema, { method: 'POST', body: input });

export const loginRequest = (input: LoginInput): Promise<AuthResponse> =>
  request('/auth/login', authResponseSchema, { method: 'POST', body: input });

export const refreshRequest = (refreshToken: string): Promise<AuthResponse> =>
  request('/auth/refresh', authResponseSchema, { method: 'POST', body: { refreshToken } });

export const logoutRequest = (refreshToken: string): Promise<MessageResponse> =>
  request('/auth/logout', messageResponseSchema, { method: 'POST', body: { refreshToken } });

export const resendVerifyRequest = (input: ResendVerifyInput): Promise<MessageResponse> =>
  request('/auth/resend-verify', messageResponseSchema, { method: 'POST', body: input });

export const forgotPasswordRequest = (input: ForgotPasswordInput): Promise<MessageResponse> =>
  request('/auth/forgot-password', messageResponseSchema, { method: 'POST', body: input });

export const resetPasswordRequest = (input: ResetPasswordInput): Promise<MessageResponse> =>
  request('/auth/reset-password', messageResponseSchema, { method: 'POST', body: input });

export const googleSignInRequest = (idToken: string): Promise<AuthResponse> =>
  request('/auth/google', authResponseSchema, { method: 'POST', body: { idToken } });

export const appleSignInRequest = (
  idToken: string,
  fullName?: { givenName?: string | null; familyName?: string | null },
): Promise<AuthResponse> =>
  request('/auth/apple', authResponseSchema, {
    method: 'POST',
    body: { idToken, fullName },
  });

export const meRequest = (token: string): Promise<PublicUser> =>
  request('/me', publicUserSchema, { token });

export const meAuthed = (): Promise<PublicUser> => authedRequest('/me', publicUserSchema);

'use server';

import { authResponseSchema, loginSchema } from '@jdm/shared/auth';
import { redirect } from 'next/navigation';

import { apiFetch, ApiError } from './api.js';
import { clearSession, writeSession } from './auth-session.js';

export type LoginState = { error: string | null };

export const loginAction = async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Email ou senha inválidos.' };
  try {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
      schema: authResponseSchema,
      auth: false,
    });
    if (res.user.role !== 'organizer' && res.user.role !== 'admin') {
      return { error: 'Conta sem permissão de administrador.' };
    }
    await writeSession(res);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      return { error: 'Credenciais inválidas.' };
    }
    if (e instanceof ApiError && e.status === 403) {
      return { error: 'Verifique seu email antes de entrar.' };
    }
    return { error: 'Erro ao entrar. Tente novamente.' };
  }
  redirect('/events');
};

export const logoutAction = async (): Promise<void> => {
  await clearSession();
  redirect('/login');
};

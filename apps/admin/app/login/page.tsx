'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { loginAction, type LoginState } from '~/lib/auth-actions';

const initial: LoginState = { error: null };

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-[color:var(--color-accent)] px-4 py-2 font-semibold disabled:opacity-50"
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
};

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initial);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">JDM Admin · Entrar</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Senha</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
        <SubmitButton />
      </form>
    </main>
  );
}

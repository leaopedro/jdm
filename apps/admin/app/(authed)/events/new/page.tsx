'use client';

import { BRAZIL_STATE_CODES } from '@jdm/shared/profile';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { createEventAction, type EventFormState } from '~/lib/event-actions';

const initial: EventFormState = { error: null };

const Submit = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-[color:var(--color-accent)] px-4 py-2 font-semibold disabled:opacity-50"
    >
      {pending ? 'Criando…' : 'Criar evento'}
    </button>
  );
};

const Field = ({
  label,
  name,
  type = 'text',
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="flex flex-col gap-1">
    <span className="text-sm text-[color:var(--color-muted)]">{label}</span>
    <input
      name={name}
      type={type}
      {...rest}
      className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
    />
  </label>
);

export default function NewEventPage() {
  const [state, action] = useActionState(createEventAction, initial);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Novo evento</h1>
      <form action={action} className="grid grid-cols-2 gap-4">
        <Field label="Slug" name="slug" required placeholder="encontro-sp-maio" />
        <Field label="Título" name="title" required />
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Descrição</span>
          <textarea
            name="description"
            required
            rows={5}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <Field label="Início" name="startsAt" type="datetime-local" required />
        <Field label="Fim" name="endsAt" type="datetime-local" required />
        <Field label="Local (nome)" name="venueName" required />
        <Field label="Endereço" name="venueAddress" required />
        <Field label="Latitude" name="lat" type="number" step="0.000001" required />
        <Field label="Longitude" name="lng" type="number" step="0.000001" required />
        <Field label="Cidade" name="city" required />
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Estado</span>
          <select
            name="stateCode"
            required
            defaultValue="SP"
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          >
            {BRAZIL_STATE_CODES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Tipo</span>
          <select
            name="type"
            required
            defaultValue="meeting"
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          >
            <option value="meeting">Encontro</option>
            <option value="drift">Drift</option>
            <option value="other">Outro</option>
          </select>
        </label>
        <Field label="Capacidade" name="capacity" type="number" min={0} required />
        <input type="hidden" name="coverObjectKey" value="" />
        {state.error ? <p className="col-span-2 text-sm text-red-400">{state.error}</p> : null}
        <div className="col-span-2">
          <Submit />
        </div>
      </form>
    </section>
  );
}

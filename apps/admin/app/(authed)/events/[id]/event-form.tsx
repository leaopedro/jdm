'use client';

import type { AdminEventDetail } from '@jdm/shared/admin';
import { BRAZIL_STATE_CODES } from '@jdm/shared/profile';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { CoverUploader } from '~/components/cover-uploader';
import {
  cancelEventAction,
  publishEventAction,
  updateEventAction,
  type EventFormState,
} from '~/lib/event-actions';

const initial: EventFormState = { error: null };

const Submit = ({ label }: { label: string }) => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-[color:var(--color-accent)] px-4 py-2 font-semibold disabled:opacity-50"
    >
      {pending ? '…' : label}
    </button>
  );
};

const isoToLocal = (iso: string) => iso.slice(0, 16);

export const EventForm = ({ event }: { event: AdminEventDetail }) => {
  const [state, action] = useActionState(updateEventAction.bind(null, event.id), initial);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {event.status === 'draft' ? (
          <form
            action={() => {
              void publishEventAction(event.id);
            }}
          >
            <Submit label="Publicar" />
          </form>
        ) : null}
        {event.status !== 'cancelled' ? (
          <form
            action={() => {
              void cancelEventAction(event.id);
            }}
          >
            <button
              type="submit"
              className="rounded border border-red-700 px-3 py-2 text-sm text-red-400"
            >
              Cancelar evento
            </button>
          </form>
        ) : null}
      </div>

      <form action={action} className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Título</span>
          <input
            name="title"
            defaultValue={event.title}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <div className="col-span-2">
          <CoverUploader initialKey={event.coverObjectKey} initialUrl={event.coverUrl} />
        </div>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Descrição</span>
          <textarea
            name="description"
            defaultValue={event.description}
            rows={5}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Início</span>
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={isoToLocal(event.startsAt)}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Fim</span>
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={isoToLocal(event.endsAt)}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Local (opcional)</span>
          <input
            name="venueName"
            defaultValue={event.venueName ?? ''}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Endereço (opcional)</span>
          <input
            name="venueAddress"
            defaultValue={event.venueAddress ?? ''}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Cidade (opcional)</span>
          <input
            name="city"
            defaultValue={event.city ?? ''}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Estado (opcional)</span>
          <select
            name="stateCode"
            defaultValue={event.stateCode ?? ''}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          >
            <option value="">—</option>
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
            defaultValue={event.type}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          >
            <option value="meeting">Encontro</option>
            <option value="drift">Drift</option>
            <option value="other">Outro</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Capacidade</span>
          <input
            name="capacity"
            type="number"
            min={0}
            defaultValue={event.capacity}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        {state.error ? <p className="col-span-2 text-sm text-red-400">{state.error}</p> : null}
        <div className="col-span-2">
          <Submit label="Salvar" />
        </div>
      </form>
    </div>
  );
};

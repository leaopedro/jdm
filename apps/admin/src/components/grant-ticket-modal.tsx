'use client';

import type { AdminEventRow } from '@jdm/shared/admin';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  grantTicketAction,
  loadEventDetailAction,
  type EventDetailForGrant,
} from '~/lib/grant-actions';

type Props = {
  userId: string;
  events: AdminEventRow[];
};

const inputCls =
  'w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-sm text-[color:var(--color-fg)]';

export function GrantTicketModal({ userId, events }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventDetail, setEventDetail] = useState<EventDetailForGrant | null>(null);
  const [selectedTierId, setSelectedTierId] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [licensePlate, setLicensePlate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selectedTier = eventDetail?.tiers.find((t) => t.id === selectedTierId);

  const resetForm = () => {
    setSelectedEventId('');
    setEventDetail(null);
    setSelectedTierId('');
    setSelectedExtras([]);
    setLicensePlate('');
    setNote('');
    setError(null);
    setSuccess(false);
  };

  const close = () => {
    setOpen(false);
    resetForm();
  };

  const handleEventChange = (eventId: string) => {
    setSelectedEventId(eventId);
    setEventDetail(null);
    setSelectedTierId('');
    setSelectedExtras([]);
    if (!eventId) return;
    startTransition(async () => {
      const detail = await loadEventDetailAction(eventId);
      setEventDetail(detail);
      if (detail.tiers.length === 1) setSelectedTierId(detail.tiers[0]?.id ?? '');
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !selectedTierId) return;
    startTransition(async () => {
      setError(null);
      const result = await grantTicketAction(userId, {
        eventId: selectedEventId,
        tierId: selectedTierId,
        extras: selectedExtras,
        ...(licensePlate.trim() ? { licensePlate: licensePlate.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (result.ok) {
        setSuccess(true);
        router.refresh();
        setTimeout(() => close(), 1800);
      } else {
        setError(result.error);
      }
    });
  };

  const toggleExtra = (id: string, checked: boolean) => {
    setSelectedExtras((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-[color:var(--color-accent)] px-3 py-2 text-sm font-semibold"
      >
        Atribuir ingresso
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={close} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold">Atribuir ingresso</h2>

        {success ? (
          <p className="rounded border border-green-500/40 bg-green-500/10 p-3 text-sm">
            Ingresso atribuído com sucesso!
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--color-muted)]">Evento</span>
              <select
                value={selectedEventId}
                onChange={(e) => handleEventChange(e.target.value)}
                required
                className={inputCls}
              >
                <option value="">Selecionar evento…</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </label>

            {isPending && !eventDetail ? (
              <p className="text-xs text-[color:var(--color-muted)]">Carregando categorias…</p>
            ) : null}

            {eventDetail ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">Categoria</span>
                <select
                  value={selectedTierId}
                  onChange={(e) => setSelectedTierId(e.target.value)}
                  required
                  className={inputCls}
                >
                  <option value="">Selecionar categoria…</option>
                  {eventDetail.tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {eventDetail && eventDetail.extras.length > 0 ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-xs text-[color:var(--color-muted)]">Extras</legend>
                {eventDetail.extras.map((ex) => (
                  <label key={ex.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedExtras.includes(ex.id)}
                      onChange={(e) => toggleExtra(ex.id, e.target.checked)}
                    />
                    {ex.name}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {selectedTier?.requiresCar ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">Placa do carro</span>
                <input
                  type="text"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  maxLength={20}
                  placeholder="ABC-1234"
                  className={inputCls}
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--color-muted)]">Observação (opcional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                className={inputCls}
              />
            </label>

            {error ? (
              <p className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm">{error}</p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={close}
                className="rounded border border-[color:var(--color-border)] px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending || !selectedEventId || !selectedTierId}
                className="rounded bg-[color:var(--color-accent)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              >
                {isPending ? '…' : 'Confirmar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

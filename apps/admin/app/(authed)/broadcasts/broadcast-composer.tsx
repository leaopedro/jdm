'use client';

import type { BroadcastTarget } from '@jdm/shared';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';

import {
  createBroadcastAction,
  dryRunBroadcastAction,
  type BroadcastFormState,
} from '~/lib/broadcast-actions';

type EventOption = {
  id: string;
  title: string;
  startsAt: string;
};

const initialState: BroadcastFormState = { error: null, success: null };

const inputClass =
  'w-full rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm';
const labelClass = 'flex flex-col gap-1';

const defaultScheduledAt = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16);
};

const minScheduledAt = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16);

const getScheduledOffsetMinutes = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(new Date().getTimezoneOffset());
  return String(parsed.getTimezoneOffset());
};

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
    >
      {pending ? 'Salvando...' : 'Salvar broadcast'}
    </button>
  );
};

export function BroadcastComposer({ events }: { events: EventOption[] }) {
  const router = useRouter();
  const [formState, formAction] = useActionState(createBroadcastAction, initialState);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetKind, setTargetKind] = useState<BroadcastTarget['kind']>('all');
  const [targetEventId, setTargetEventId] = useState(events[0]?.id ?? '');
  const [targetCity, setTargetCity] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt());
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [isDryRunning, startDryRunTransition] = useTransition();
  const hasEventOptions = events.length > 0;

  useEffect(() => {
    if (!formState.success) return;
    router.refresh();
  }, [formState.success, router]);

  const selectedTargetLabel =
    targetKind === 'all'
      ? 'Toda a base'
      : targetKind === 'premium'
        ? 'Apenas premium'
        : targetKind === 'attendees_of_event'
          ? 'Participantes do evento'
          : 'Cidade específica';

  const currentTarget: BroadcastTarget =
    targetKind === 'attendees_of_event'
      ? { kind: 'attendees_of_event', eventId: targetEventId }
      : targetKind === 'city'
        ? { kind: 'city', city: targetCity.trim() }
        : { kind: targetKind };

  const handleDryRun = () => {
    setDryRunError(null);
    setDryRunResult(null);
    startDryRunTransition(async () => {
      const result = await dryRunBroadcastAction(currentTarget);
      if (result.ok) {
        setDryRunResult(`${result.estimatedRecipients} destinatário(s) estimado(s).`);
      } else {
        setDryRunError(result.error);
      }
    });
  };

  return (
    <div className="rounded-xl border border-[color:var(--color-border)] p-5">
      <div className="mb-5 flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Novo broadcast</h2>
        <p className="text-sm text-[color:var(--color-muted)]">
          Preencha a mensagem, escolha o alvo e confirme o alcance estimado antes de enviar.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <label className={labelClass}>
          <span className="text-sm text-[color:var(--color-muted)]">Título</span>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
            className={inputClass}
            placeholder="Ex.: Atualização do comboio"
          />
        </label>

        <label className={labelClass}>
          <span className="text-sm text-[color:var(--color-muted)]">Mensagem</span>
          <textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            maxLength={500}
            required
            className={inputClass}
            placeholder="Escreva a mensagem que será enviada no push."
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            <span className="text-sm text-[color:var(--color-muted)]">Público</span>
            <select
              name="targetKind"
              value={targetKind}
              onChange={(event) => {
                setTargetKind(event.target.value as BroadcastTarget['kind']);
                setDryRunResult(null);
                setDryRunError(null);
              }}
              className={inputClass}
            >
              <option value="all">Toda a base</option>
              <option value="premium">Somente premium</option>
              <option value="attendees_of_event" disabled={!hasEventOptions}>
                Participantes de um evento
              </option>
              <option value="city">Cidade específica</option>
            </select>
          </label>

          <div className="rounded-lg border border-[color:var(--color-border)] p-3 text-sm">
            <p className="font-medium">Destino selecionado</p>
            <p className="mt-1 text-[color:var(--color-muted)]">{selectedTargetLabel}</p>
          </div>
        </div>

        {targetKind === 'attendees_of_event' ? (
          <label className={labelClass}>
            <span className="text-sm text-[color:var(--color-muted)]">Evento</span>
            <select
              name="targetEventId"
              value={targetEventId}
              onChange={(event) => {
                setTargetEventId(event.target.value);
                setDryRunResult(null);
                setDryRunError(null);
              }}
              className={inputClass}
              required
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} • {new Date(event.startsAt).toLocaleDateString('pt-BR')}
                </option>
              ))}
            </select>
            {!hasEventOptions ? (
              <span className="text-xs text-[color:var(--color-muted)]">
                Cadastre ou publique um evento antes de segmentar participantes.
              </span>
            ) : null}
          </label>
        ) : null}

        {targetKind === 'city' ? (
          <label className={labelClass}>
            <span className="text-sm text-[color:var(--color-muted)]">Cidade</span>
            <input
              name="targetCity"
              value={targetCity}
              onChange={(event) => {
                setTargetCity(event.target.value);
                setDryRunResult(null);
                setDryRunError(null);
              }}
              className={inputClass}
              placeholder="Ex.: São Paulo"
              required
            />
          </label>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border)] p-3 text-sm">
            <input
              type="radio"
              name="deliveryMode"
              value="now"
              checked={deliveryMode === 'now'}
              onChange={() => setDeliveryMode('now')}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium">Enviar agora</span>
              <span className="text-xs text-[color:var(--color-muted)]">
                Agenda o envio imediatamente para o worker processar.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border)] p-3 text-sm">
            <input
              type="radio"
              name="deliveryMode"
              value="schedule"
              checked={deliveryMode === 'schedule'}
              onChange={() => setDeliveryMode('schedule')}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium">Agendar</span>
              <span className="text-xs text-[color:var(--color-muted)]">
                Define uma data e hora para disparo futuro.
              </span>
            </span>
          </label>
        </div>

        {deliveryMode === 'schedule' ? (
          <label className={labelClass}>
            <span className="text-sm text-[color:var(--color-muted)]">Data e hora do envio</span>
            <input
              type="datetime-local"
              name="scheduledAt"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              min={minScheduledAt()}
              className={inputClass}
              required
            />
            <input
              type="hidden"
              name="scheduledAtOffsetMinutes"
              value={getScheduledOffsetMinutes(scheduledAt)}
            />
          </label>
        ) : (
          <input type="hidden" name="scheduledAt" value={scheduledAt} />
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--color-border)] p-3">
          <button
            type="button"
            onClick={handleDryRun}
            disabled={isDryRunning}
            className="rounded border border-[color:var(--color-border)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {isDryRunning ? 'Calculando...' : 'Ver alcance estimado'}
          </button>
          {dryRunResult ? <p className="text-sm text-green-400">{dryRunResult}</p> : null}
          {dryRunError ? <p className="text-sm text-red-400">{dryRunError}</p> : null}
        </div>

        {formState.error ? <p className="text-sm text-red-400">{formState.error}</p> : null}
        {formState.success ? <p className="text-sm text-green-400">{formState.success}</p> : null}

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-[color:var(--color-muted)]">
            Revise título, corpo e público antes de salvar. Broadcasts em processamento ou enviados
            não podem ser cancelados.
          </p>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}

'use client';

import {
  type CapacityDisplayMode,
  type CapacityDisplayPolicy,
  type GeneralSettings,
  computeCapacityDisplay,
} from '@jdm/shared/general-settings';
import { useState, useTransition } from 'react';

import { updateAdminGeneralSettingsAction } from '~/lib/general-settings-actions';

const labelCls = 'flex flex-col gap-1 text-sm';
const inputCls =
  'w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-sm text-[color:var(--color-fg)]';

type Surface = { key: keyof CapacityDisplayPolicy; title: string; description: string };
const surfaces: Surface[] = [
  {
    key: 'tickets',
    title: 'Ingressos',
    description: 'Como exibir o estoque por tier de ingresso.',
  },
  {
    key: 'extras',
    title: 'Extras',
    description: 'Como exibir disponibilidade dos extras dos eventos.',
  },
  {
    key: 'products',
    title: 'Produtos da loja',
    description: 'Como exibir estoque das variantes da loja.',
  },
];

const modeOptions: { value: CapacityDisplayMode; label: string }[] = [
  { value: 'absolute', label: 'Exato (número absoluto)' },
  { value: 'percentage_threshold', label: 'Percentual abaixo do limite' },
  { value: 'hidden', label: 'Ocultar' },
];

type SurfaceState = { mode: CapacityDisplayMode; thresholdPercent: string };
type PolicyState = Record<keyof CapacityDisplayPolicy, SurfaceState>;

const toPolicyState = (policy: CapacityDisplayPolicy): PolicyState => ({
  tickets: {
    mode: policy.tickets.mode,
    thresholdPercent: String(policy.tickets.thresholdPercent),
  },
  extras: {
    mode: policy.extras.mode,
    thresholdPercent: String(policy.extras.thresholdPercent),
  },
  products: {
    mode: policy.products.mode,
    thresholdPercent: String(policy.products.thresholdPercent),
  },
});

const previewLabel = (
  surface: keyof CapacityDisplayPolicy,
  mode: CapacityDisplayMode,
  thresholdPercent: number,
  remaining: number,
  total: number,
  status: 'available' | 'sold_out' | 'unavailable',
) => {
  const r = computeCapacityDisplay({ status, remaining, total }, { mode, thresholdPercent });
  if (r.status === 'sold_out') return 'Esgotado';
  if (r.status === 'unavailable') return 'Indisponível';
  if (r.showAbsolute && r.remaining != null) {
    if (surface === 'tickets') return `${r.remaining} disponíveis`;
    if (surface === 'extras') return `${r.remaining} restantes`;
    if (surface === 'products') return `${r.remaining} restantes`;
    return `${r.remaining}`;
  }
  if (r.showPercentage && r.remainingPercent != null) return `${r.remainingPercent}% restantes`;
  return '—';
};

export function GeneralSettingsForm({ initial }: { initial: GeneralSettings }) {
  const [state, setState] = useState<PolicyState>(toPolicyState(initial.capacityDisplay));
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const setSurfaceMode = (key: keyof CapacityDisplayPolicy, mode: CapacityDisplayMode) =>
    setState((prev) => ({ ...prev, [key]: { ...prev[key], mode } }));

  const setSurfaceThreshold = (key: keyof CapacityDisplayPolicy, thresholdPercent: string) =>
    setState((prev) => ({ ...prev, [key]: { ...prev[key], thresholdPercent } }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload: NonNullable<
      Parameters<typeof updateAdminGeneralSettingsAction>[0]['capacityDisplay']
    > = {};

    for (const { key } of surfaces) {
      const surface = state[key];
      const threshold = Number(surface.thresholdPercent);
      if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
        setError(`Limite percentual de ${key} deve ser um inteiro entre 0 e 100.`);
        return;
      }
      payload[key] = { mode: surface.mode, thresholdPercent: threshold };
    }

    startTransition(async () => {
      const result = await updateAdminGeneralSettingsAction({ capacityDisplay: payload });
      if (result.ok) {
        setState(toPolicyState(result.settings.capacityDisplay));
        setUpdatedAt(result.settings.updatedAt);
        setSuccess('Configurações salvas.');
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-4">
      {surfaces.map(({ key, title, description }) => {
        const surface = state[key];
        const thresholdNumber = Number(surface.thresholdPercent) || 0;
        return (
          <fieldset
            key={key}
            className="flex flex-col gap-3 rounded border border-[color:var(--color-border)] p-4"
          >
            <legend className="px-1 text-sm font-medium">{title}</legend>
            <p className="text-xs text-[color:var(--color-muted)]">{description}</p>

            <label className={labelCls}>
              <span className="font-medium">Modo</span>
              <select
                value={surface.mode}
                onChange={(e) => setSurfaceMode(key, e.target.value as CapacityDisplayMode)}
                className={inputCls}
                aria-label={`Modo de exibição para ${title}`}
              >
                {modeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelCls}>
              <span className="font-medium">Limite percentual (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={surface.thresholdPercent}
                disabled={surface.mode !== 'percentage_threshold'}
                onChange={(e) => setSurfaceThreshold(key, e.target.value)}
                className={inputCls}
                aria-label={`Limite percentual para ${title}`}
              />
              <span className="text-xs text-[color:var(--color-muted)]">
                Só mostra a porcentagem quando o estoque restante for igual ou abaixo deste limite.
              </span>
            </label>

            <div className="mt-1 flex flex-col gap-1 rounded bg-[color:var(--color-bg)] p-3 text-xs">
              <span className="font-medium">Pré-visualização</span>
              <span>
                Estoque saudável (8/10):{' '}
                {previewLabel(key, surface.mode, thresholdNumber, 8, 10, 'available')}
              </span>
              <span>
                Estoque baixo (1/10):{' '}
                {previewLabel(key, surface.mode, thresholdNumber, 1, 10, 'available')}
              </span>
              <span>
                Esgotado: {previewLabel(key, surface.mode, thresholdNumber, 0, 10, 'sold_out')}
              </span>
            </div>
          </fieldset>
        );
      })}

      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm text-green-500">
          {success}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? 'Salvando...' : 'Salvar'}
        </button>
        <span className="text-xs text-[color:var(--color-muted)]">
          Última atualização: {new Date(updatedAt).toLocaleString('pt-BR')}
        </span>
      </div>

      <p className="text-xs text-[color:var(--color-muted)]">
        Estados de esgotado e indisponível continuam visíveis em todos os modos.
      </p>
    </form>
  );
}

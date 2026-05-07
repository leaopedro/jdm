'use client';

import type { StoreSettings } from '@jdm/shared/store';
import { useState, useTransition } from 'react';

import { updateAdminStoreSettingsAction } from '~/lib/store-settings-actions';

const inputCls =
  'w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-sm text-[color:var(--color-fg)]';

const labelCls = 'flex flex-col gap-1 text-sm';

const formatCents = (cents: number) => (cents / 100).toFixed(2);

const parseReais = (raw: string): number | null => {
  const normalized = raw.replace(',', '.').trim();
  if (normalized === '') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
};

export function StoreSettingsForm({ initial }: { initial: StoreSettings }) {
  const [shippingFee, setShippingFee] = useState(formatCents(initial.defaultShippingFeeCents));
  const [lowStock, setLowStock] = useState(String(initial.lowStockThreshold));
  const [pickup, setPickup] = useState(initial.pickupDisplayLabel ?? '');
  const [phone, setPhone] = useState(initial.supportPhone ?? '');
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const shippingCents = parseReais(shippingFee);
    if (shippingCents === null) {
      setError('Frete padrão inválido. Use um valor em reais (ex.: 19,90).');
      return;
    }

    const lowStockNumber = Number(lowStock);
    if (!Number.isInteger(lowStockNumber) || lowStockNumber < 0) {
      setError('Limite de estoque baixo deve ser um inteiro maior ou igual a zero.');
      return;
    }

    const pickupTrimmed = pickup.trim();
    const phoneTrimmed = phone.trim();

    startTransition(async () => {
      const result = await updateAdminStoreSettingsAction({
        defaultShippingFeeCents: shippingCents,
        lowStockThreshold: lowStockNumber,
        pickupDisplayLabel: pickupTrimmed === '' ? null : pickupTrimmed,
        supportPhone: phoneTrimmed === '' ? null : phoneTrimmed,
      });
      if (result.ok) {
        setShippingFee(formatCents(result.settings.defaultShippingFeeCents));
        setLowStock(String(result.settings.lowStockThreshold));
        setPickup(result.settings.pickupDisplayLabel ?? '');
        setPhone(result.settings.supportPhone ?? '');
        setUpdatedAt(result.settings.updatedAt);
        setSuccess('Configurações salvas.');
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <label className={labelCls}>
        <span className="font-medium">Frete padrão (R$)</span>
        <input
          type="text"
          inputMode="decimal"
          value={shippingFee}
          onChange={(e) => setShippingFee(e.target.value)}
          className={inputCls}
          aria-label="Frete padrão em reais"
        />
        <span className="text-xs text-[color:var(--color-muted)]">
          Valor sugerido para envios físicos quando não houver tabela específica.
        </span>
      </label>

      <label className={labelCls}>
        <span className="font-medium">Limite de estoque baixo</span>
        <input
          type="number"
          min={0}
          step={1}
          value={lowStock}
          onChange={(e) => setLowStock(e.target.value)}
          className={inputCls}
          aria-label="Limite de estoque baixo"
        />
        <span className="text-xs text-[color:var(--color-muted)]">
          Variantes com estoque igual ou abaixo deste limite são destacadas no painel.
        </span>
      </label>

      <label className={labelCls}>
        <span className="font-medium">Texto da retirada local</span>
        <input
          type="text"
          maxLength={140}
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          className={inputCls}
          placeholder="Ex.: Retirada na sede do JDM, das 10h às 18h"
        />
      </label>

      <label className={labelCls}>
        <span className="font-medium">Telefone de suporte</span>
        <input
          type="text"
          maxLength={20}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputCls}
          placeholder="(11) 99999-0000"
        />
      </label>

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
    </form>
  );
}

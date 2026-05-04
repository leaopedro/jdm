'use client';

import { useState } from 'react';

type Filters = {
  from: string | null;
  to: string | null;
  provider: string | null;
  method: string | null;
  search: string | null;
};

type Props = {
  filters: Filters;
  onFilterChange: (key: string, value: string | null) => void;
  onClear: () => void;
  isPending: boolean;
};

const providerOptions = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'abacatepay', label: 'AbacatePay' },
];

const methodOptions = [
  { value: 'card', label: 'Cartão' },
  { value: 'pix', label: 'Pix' },
];

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]'
          : 'border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:border-[color:var(--color-muted)]'
      }`}
    >
      {label}
    </button>
  );
}

export function FilterBar({ filters, onFilterChange, onClear, isPending }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasFilters = Object.values(filters).some(Boolean);

  const filterContent = (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={filters.from ?? ''}
        onChange={(e) => onFilterChange('from', e.target.value || null)}
        placeholder="De"
        className="rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs text-[color:var(--color-fg)]"
      />
      <span className="text-xs text-[color:var(--color-muted)]">a</span>
      <input
        type="date"
        value={filters.to ?? ''}
        onChange={(e) => onFilterChange('to', e.target.value || null)}
        placeholder="Até"
        className="rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs text-[color:var(--color-fg)]"
      />

      <span className="mx-1 h-4 w-px bg-[color:var(--color-border)]" />

      {providerOptions.map((opt) => (
        <Chip
          key={opt.value}
          label={opt.label}
          active={filters.provider === opt.value}
          onClick={() =>
            onFilterChange('provider', filters.provider === opt.value ? null : opt.value)
          }
        />
      ))}

      <span className="mx-1 h-4 w-px bg-[color:var(--color-border)]" />

      {methodOptions.map((opt) => (
        <Chip
          key={opt.value}
          label={opt.label}
          active={filters.method === opt.value}
          onClick={() => onFilterChange('method', filters.method === opt.value ? null : opt.value)}
        />
      ))}

      {hasFilters ? (
        <>
          <span className="mx-1 h-4 w-px bg-[color:var(--color-border)]" />
          <button
            onClick={onClear}
            className="text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          >
            Limpar filtros
          </button>
        </>
      ) : null}

      {isPending ? (
        <span className="ml-2 text-xs text-[color:var(--color-muted)]">Atualizando...</span>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Desktop: sticky inline bar */}
      <div className="sticky top-0 z-10 hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 sm:block">
        {filterContent}
      </div>

      {/* Mobile: trigger button + sheet */}
      <div className="sm:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm"
        >
          <span>Filtros{hasFilters ? ' (ativos)' : ''}</span>
          <span className="text-xs">{mobileOpen ? '▲' : '▼'}</span>
        </button>
        {mobileOpen ? (
          <div className="mt-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
            {filterContent}
          </div>
        ) : null}
      </div>
    </>
  );
}

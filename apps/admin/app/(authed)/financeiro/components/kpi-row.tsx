import type { AdminFinanceSummary } from '@jdm/shared/admin';

const fmtCurrency = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

const fmtNumber = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

type Tile = { label: string; value: string; accent?: boolean };

function buildTiles(s: AdminFinanceSummary): Tile[] {
  return [
    { label: 'Receita total', value: fmtCurrency(s.totalRevenueCents), accent: true },
    { label: 'Pedidos', value: fmtNumber(s.orderCount) },
    { label: 'Ticket médio', value: fmtCurrency(s.avgOrderCents) },
    { label: 'Ingressos', value: fmtNumber(s.ticketCount) },
    { label: 'Reembolsado', value: fmtCurrency(s.refundedCents) },
    { label: 'Reembolsos', value: fmtNumber(s.refundedCount) },
  ];
}

export function KpiRow({ summary }: { summary: AdminFinanceSummary }) {
  const tiles = buildTiles(summary);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-[color:var(--color-border)] p-4">
          <div className="text-xs text-[color:var(--color-muted)]">{t.label}</div>
          <div
            className={`mt-1 text-xl font-semibold tabular-nums ${t.accent ? 'text-[color:var(--color-accent)]' : ''}`}
          >
            {t.value}
          </div>
        </div>
      ))}
    </div>
  );
}

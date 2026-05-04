'use client';

import type { AdminFinanceTrendPoint } from '@jdm/shared/admin';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const fmtCurrency = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

const fmtDateShort = (dateStr: string) => {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: AdminFinanceTrendPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm shadow-lg">
      <div className="font-semibold">{p.date}</div>
      <div className="text-[color:var(--color-accent)]">{fmtCurrency(p.revenueCents)}</div>
      <div className="text-[color:var(--color-muted)]">{p.orderCount} pedidos</div>
    </div>
  );
}

export function TrendChart({ points }: { points: AdminFinanceTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-[color:var(--color-border)]">
        <p className="text-sm text-[color:var(--color-muted)]">Sem dados de tendência</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[color:var(--color-border)] p-4">
      <h3 className="mb-3 text-sm font-semibold">Receita diária</h3>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#e10600" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#e10600" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1f1f24" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDateShort}
            tick={{ fill: '#8a8a93', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => fmtCurrency(v)}
            tick={{ fill: '#8a8a93', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="revenueCents"
            stroke="#e10600"
            strokeWidth={2}
            fill="url(#revenueGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

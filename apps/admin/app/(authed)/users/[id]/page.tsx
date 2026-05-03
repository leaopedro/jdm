import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GrantTicketModal } from '~/components/grant-ticket-modal';
import { UserAvatar } from '~/components/user-avatar';
import { getAdminUser, listAdminEvents } from '~/lib/admin-api';
import { ApiError } from '~/lib/api';

export const dynamic = 'force-dynamic';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const fmtCurrency = (cents: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);

const roleLabelMap: Record<string, string> = {
  user: 'Usuário',
  organizer: 'Organizador',
  admin: 'Admin',
  staff: 'Staff',
};

const ticketStatusLabel: Record<string, string> = {
  valid: 'Válido',
  used: 'Utilizado',
  revoked: 'Revogado',
};

const ticketSourceLabel: Record<string, string> = {
  purchase: 'Compra',
  premium_grant: 'Premium',
  comp: 'Cortesia',
};

const orderStatusLabel: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  failed: 'Falhou',
  refunded: 'Reembolsado',
  expired: 'Expirado',
};

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let user;
  try {
    user = await getAdminUser(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const { items: events } = await listAdminEvents();
  const location = [user.city, user.stateCode].filter(Boolean).join('/');

  return (
    <section className="flex flex-col gap-6">
      <Link href="/users" className="text-sm text-[color:var(--color-muted)] hover:underline">
        ← Usuários
      </Link>

      <div className="flex items-start justify-between gap-4">
        <GrantTicketModal userId={user.id} events={events} />
      </div>

      {/* Header card */}
      <div className="flex items-start gap-4 rounded border border-[color:var(--color-border)] p-4">
        <UserAvatar name={user.name} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold">{user.name}</h1>
          <span className="flex items-center gap-1 text-sm text-[color:var(--color-muted)]">
            {user.email}
            {user.emailVerifiedAt ? (
              <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                Verificado
              </span>
            ) : (
              <span className="rounded bg-yellow-900 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-300">
                Não verificado
              </span>
            )}
          </span>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded bg-[color:var(--color-border)] px-2 py-0.5 text-xs font-semibold">
              {roleLabelMap[user.role] ?? user.role}
            </span>
            {location && <span className="text-[color:var(--color-muted)]">{location}</span>}
          </div>
          <span className="text-xs text-[color:var(--color-muted)]">
            Membro desde {fmtDate(user.createdAt)}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <div className="rounded border border-[color:var(--color-border)] px-4 py-3 text-center">
          <div className="text-2xl font-bold">{user.stats.totalTickets}</div>
          <div className="text-xs text-[color:var(--color-muted)]">Ingressos</div>
        </div>
        <div className="rounded border border-[color:var(--color-border)] px-4 py-3 text-center">
          <div className="text-2xl font-bold">{user.stats.totalOrders}</div>
          <div className="text-xs text-[color:var(--color-muted)]">Pedidos</div>
        </div>
      </div>

      {/* Recent tickets */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">Ingressos recentes</h2>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-sm text-[color:var(--color-muted)]">
              <th className="py-2">Evento</th>
              <th>Status</th>
              <th>Origem</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {user.recentTickets.map((t) => (
              <tr key={t.id} className="border-b border-[color:var(--color-border)]">
                <td className="py-2 text-sm">{t.eventTitle}</td>
                <td className="text-sm">{ticketStatusLabel[t.status] ?? t.status}</td>
                <td className="text-sm">{ticketSourceLabel[t.source] ?? t.source}</td>
                <td className="text-sm">{fmtDate(t.createdAt)}</td>
              </tr>
            ))}
            {user.recentTickets.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="py-4 text-center text-sm text-[color:var(--color-muted)]"
                >
                  Nenhum ingresso.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent orders */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">Pedidos recentes</h2>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-sm text-[color:var(--color-muted)]">
              <th className="py-2">Evento</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {user.recentOrders.map((o) => (
              <tr key={o.id} className="border-b border-[color:var(--color-border)]">
                <td className="py-2 text-sm">{o.eventTitle}</td>
                <td className="text-sm">{orderStatusLabel[o.status] ?? o.status}</td>
                <td className="text-sm">{fmtCurrency(o.amountCents, o.currency)}</td>
                <td className="text-sm">{fmtDate(o.createdAt)}</td>
              </tr>
            ))}
            {user.recentOrders.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="py-4 text-center text-sm text-[color:var(--color-muted)]"
                >
                  Nenhum pedido.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

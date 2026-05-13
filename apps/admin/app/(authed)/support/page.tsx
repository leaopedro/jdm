import Link from 'next/link';

import { listAdminSupportTickets } from '~/lib/admin-api';

export const dynamic = 'force-dynamic';

const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR');

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const status = params.status === 'closed' ? ('closed' as const) : ('open' as const);
  const listOpts: { status?: 'open' | 'closed'; cursor?: string } = { status };
  if (params.cursor) listOpts.cursor = params.cursor;
  const { items, hasMore, nextCursor } = await listAdminSupportTickets(listOpts);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Suporte</h1>
        <nav className="flex gap-4 text-sm">
          <Link
            href="/support?status=open"
            className={status === 'open' ? 'font-semibold' : 'opacity-60 hover:opacity-100'}
          >
            Abertos
          </Link>
          <Link
            href="/support?status=closed"
            className={status === 'closed' ? 'font-semibold' : 'opacity-60 hover:opacity-100'}
          >
            Fechados
          </Link>
        </nav>
      </header>

      {items.length === 0 ? (
        <p className="text-[color:var(--color-muted)]">
          Nenhum chamado {status === 'open' ? 'aberto' : 'fechado'}.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-[color:var(--color-muted)]">
              <th className="py-2 pr-4">Usuário</th>
              <th className="pr-4">Telefone</th>
              <th className="pr-4">Mensagem</th>
              <th>Criado em</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr
                key={t.id}
                className="border-b border-[color:var(--color-border)] hover:bg-[color:var(--color-surface)]"
              >
                <td className="py-2 pr-4">
                  <Link href={`/support/${t.id}`} className="font-medium hover:underline">
                    {t.user.name}
                  </Link>
                  <div className="text-[color:var(--color-muted)]">{t.user.email}</div>
                </td>
                <td className="pr-4 font-mono">{t.phone}</td>
                <td className="max-w-xs truncate pr-4 text-[color:var(--color-muted)]">
                  {t.message}
                </td>
                <td className="whitespace-nowrap">{fmtDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasMore && nextCursor && (
        <Link
          href={`/support?status=${status}&cursor=${nextCursor}`}
          className="self-start text-sm underline"
        >
          Próxima página
        </Link>
      )}
    </section>
  );
}

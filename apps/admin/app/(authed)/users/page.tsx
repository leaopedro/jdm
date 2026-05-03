import Link from 'next/link';

import { SearchForm } from './search-form';

import { searchAdminUsers } from '~/lib/admin-api';

export const dynamic = 'force-dynamic';

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-border)] text-xs font-semibold">
      {initials}
    </span>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? '';
  const cursor = params.cursor;
  const searchOpts: { q?: string; cursor?: string } = {};
  if (q) searchOpts.q = q;
  if (cursor) searchOpts.cursor = cursor;
  const { items, nextCursor } = await searchAdminUsers(searchOpts);

  const nextParams = new URLSearchParams();
  if (q) nextParams.set('q', q);
  if (nextCursor) nextParams.set('cursor', nextCursor);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <SearchForm />
      </header>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] text-sm text-[color:var(--color-muted)]">
            <th className="py-2">Nome</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id} className="border-b border-[color:var(--color-border)]">
              <td className="py-2">
                <Link href={`/users/${u.id}`} className="flex items-center gap-2 hover:underline">
                  <Avatar name={u.name} />
                  {u.name}
                </Link>
              </td>
              <td className="text-sm text-[color:var(--color-muted)]">{u.email}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={2} className="py-6 text-center text-[color:var(--color-muted)]">
                Nenhum usuário encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {nextCursor && (
        <div className="flex justify-center">
          <Link
            href={`/users?${nextParams}`}
            className="rounded border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-border)]"
          >
            Carregar mais
          </Link>
        </div>
      )}
    </section>
  );
}

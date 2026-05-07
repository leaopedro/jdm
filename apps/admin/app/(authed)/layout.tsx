import Link from 'next/link';

import { LogoutButton } from '~/components/logout-button';
import { readRole } from '~/lib/auth-session';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const role = await readRole();
  const isStaff = role === 'staff';

  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between border-b border-[color:var(--color-border)] px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href={isStaff ? '/check-in' : '/events'} className="font-semibold">
            JDM Admin
          </Link>
          {!isStaff ? (
            <>
              <Link href="/events" className="text-sm opacity-80 hover:opacity-100">
                Eventos
              </Link>
              <Link href="/loja/produtos" className="text-sm opacity-80 hover:opacity-100">
                Loja
              </Link>
              <Link href="/users" className="text-sm opacity-80 hover:opacity-100">
                Usuários
              </Link>
              <Link href="/financeiro" className="text-sm opacity-80 hover:opacity-100">
                Financeiro
              </Link>
              <Link href="/loja/colecoes" className="text-sm opacity-80 hover:opacity-100">
                Coleções
              </Link>
              <Link href="/configuracoes" className="text-sm opacity-80 hover:opacity-100">
                Configurações
              </Link>
              <Link href="/store/tipos" className="text-sm opacity-80 hover:opacity-100">
                Tipos da loja
              </Link>
            </>
          ) : null}
          <Link href="/check-in" className="text-sm opacity-80 hover:opacity-100">
            Check-in
          </Link>
        </div>
        <LogoutButton />
      </nav>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}

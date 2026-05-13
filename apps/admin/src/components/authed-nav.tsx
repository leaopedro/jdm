'use client';

import Link from 'next/link';
import { useState } from 'react';

import { LogoutButton } from './logout-button';

const ORGANIZER_LINKS = [
  { href: '/events', label: 'Eventos' },
  { href: '/loja', label: 'Loja' },
  { href: '/users', label: 'Usuários' },
  { href: '/financeiro', label: 'Financeiro' },
  { href: '/broadcasts', label: 'Broadcasts' },
  { href: '/support', label: 'Suporte' },
  { href: '/check-in', label: 'Check-in' },
] as const;

const STAFF_LINKS = [{ href: '/check-in', label: 'Check-in' }] as const;

export const AuthedNav = ({ isStaff }: { isStaff: boolean }) => {
  const [open, setOpen] = useState(false);
  const links = isStaff ? STAFF_LINKS : ORGANIZER_LINKS;
  const homeHref = isStaff ? '/check-in' : '/events';

  return (
    <nav className="border-b border-[color:var(--color-border)]">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href={homeHref} className="font-semibold">
            JDM Admin
          </Link>
          <div className="hidden items-center gap-4 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm opacity-80 hover:opacity-100">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LogoutButton />
          <button
            type="button"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex flex-col justify-center gap-1.5 rounded p-1 focus-visible:outline focus-visible:outline-offset-1 focus-visible:outline-[color:var(--color-border)] md:hidden"
          >
            <span className="block h-0.5 w-5 bg-current" />
            <span className="block h-0.5 w-5 bg-current" />
            <span className="block h-0.5 w-5 bg-current" />
          </button>
        </div>
      </div>
      {open ? (
        <div className="flex flex-col border-t border-[color:var(--color-border)] px-6 py-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="py-2.5 text-sm opacity-80 hover:opacity-100"
            >
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
};

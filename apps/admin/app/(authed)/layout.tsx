import Link from 'next/link';

import { LogoutButton } from '~/components/logout-button';

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between border-b border-[color:var(--color-border)] px-6 py-3">
        <Link href="/events" className="font-semibold">
          JDM Admin
        </Link>
        <LogoutButton />
      </nav>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}

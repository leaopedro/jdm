import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'JDM Experience · Admin',
  description: 'Organizer console for JDM Experience',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

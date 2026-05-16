export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <main>{children}</main>
      <footer className="border-t border-[color:var(--color-border)] py-6 text-center text-xs text-[color:var(--color-muted)]">
        JDM Experience · Encarregado de Dados:{' '}
        <a
          href="mailto:privacidade@jdmexperience.com.br"
          className="underline hover:text-[color:var(--color-foreground)]"
        >
          privacidade@jdmexperience.com.br
        </a>{' '}
        ·{' '}
        <a href="/privacidade" className="underline hover:text-[color:var(--color-foreground)]">
          Política de privacidade
        </a>
      </footer>
    </div>
  );
}

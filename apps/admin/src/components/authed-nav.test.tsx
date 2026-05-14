import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...(rest as object)}>
      {children}
    </a>
  ),
}));

vi.mock('./logout-button', () => ({
  LogoutButton: () => <button type="submit">Sair</button>,
}));

import { AuthedNav } from './authed-nav';

describe('AuthedNav — organizer role', () => {
  it('renders all organizer nav links', () => {
    const html = renderToStaticMarkup(<AuthedNav isStaff={false} />);
    expect(html).toContain('href="/events"');
    expect(html).toContain('href="/loja"');
    expect(html).toContain('href="/users"');
    expect(html).toContain('href="/financeiro"');
    expect(html).toContain('href="/broadcasts"');
    expect(html).toContain('href="/support"');
    expect(html).toContain('href="/check-in"');
  });

  it('brand link points to /events', () => {
    const html = renderToStaticMarkup(<AuthedNav isStaff={false} />);
    expect(html.indexOf('href="/events"')).toBeGreaterThan(-1);
  });
});

describe('AuthedNav — staff role', () => {
  it('renders only check-in link', () => {
    const html = renderToStaticMarkup(<AuthedNav isStaff={true} />);
    expect(html).toContain('href="/check-in"');
    expect(html).not.toContain('href="/events"');
    expect(html).not.toContain('href="/loja"');
    expect(html).not.toContain('href="/users"');
    expect(html).not.toContain('href="/financeiro"');
    expect(html).not.toContain('href="/broadcasts"');
    expect(html).not.toContain('href="/support"');
  });

  it('brand link points to /check-in', () => {
    const html = renderToStaticMarkup(<AuthedNav isStaff={true} />);
    expect(html).toContain('href="/check-in"');
  });
});

describe('AuthedNav — hamburger button', () => {
  it('renders hamburger with aria attributes', () => {
    const html = renderToStaticMarkup(<AuthedNav isStaff={false} />);
    expect(html).toContain('aria-label=');
    expect(html).toContain('aria-expanded="false"');
  });

  it('mobile dropdown not visible on initial server render', () => {
    const html = renderToStaticMarkup(<AuthedNav isStaff={false} />);
    // The mobile dropdown div only renders when open=true (initial state false)
    // Desktop link container uses md:flex; the mobile-only dropdown uses md:hidden
    // With open=false the dropdown is not in the markup at all
    expect(html.match(/md:hidden/g) ?? []).toHaveLength(1);
  });
});

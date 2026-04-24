import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/', '/events/:path*', '/check-in/:path*', '/login'],
};

type Role = 'organizer' | 'admin' | 'staff';

const isRole = (v: string | undefined): v is Role =>
  v === 'organizer' || v === 'admin' || v === 'staff';

const homeFor = (role: Role) => (role === 'staff' ? '/check-in' : '/events');

export const middleware = (req: NextRequest) => {
  const rawRole = req.cookies.get('session_role')?.value;
  const role = isRole(rawRole) ? rawRole : null;
  const path = req.nextUrl.pathname;

  // Not authed: only /login and / are reachable.
  if (!role) {
    if (path !== '/login' && path !== '/') {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    return NextResponse.next();
  }

  // Authed but hitting /login: send home.
  if (path === '/login' || path === '/') {
    return NextResponse.redirect(new URL(homeFor(role), req.url));
  }

  // Staff cannot touch /events/*.
  if (role === 'staff' && path.startsWith('/events')) {
    return NextResponse.redirect(new URL('/check-in', req.url));
  }

  return NextResponse.next();
};

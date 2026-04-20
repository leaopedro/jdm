import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/', '/events/:path*', '/login'],
};

export const middleware = (req: NextRequest) => {
  const role = req.cookies.get('session_role')?.value;
  const authed = role === 'organizer' || role === 'admin';
  const path = req.nextUrl.pathname;
  if (!authed && path !== '/login' && path !== '/') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (authed && path === '/login') {
    return NextResponse.redirect(new URL('/events', req.url));
  }
  return NextResponse.next();
};

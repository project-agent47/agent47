import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/workspaces')) {
    const sessionCookie =
      request.cookies.get('decision-workspace-auth')?.value ??
      request.cookies.get('decision-workspace-auth-client')?.value;

    if (!sessionCookie) {
      const signInUrl = new URL('/signin', request.url);
      signInUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/workspaces/:path*'],
};

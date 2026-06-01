import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/.procile/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/\.procile/, '/profile');

    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/.profile/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/\.profile/, '/profile');

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|images|icons|favicon.ico|site.webmanifest).*)'],
};

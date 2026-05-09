import { NextResponse, type NextRequest } from 'next/server';

import type { HelixMiddleware } from './chain';

export const requestHeadersMiddleware: HelixMiddleware = (
  request: NextRequest,
) => {
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set('x-helix-pathname', request.nextUrl.pathname);
  requestHeaders.set('x-helix-method', request.method);
  requestHeaders.set('x-helix-proxy', 'true');

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
};
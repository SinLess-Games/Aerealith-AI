import type { NextFetchEvent, NextMiddleware, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { requestHeadersMiddleware } from './request-headers.middleware';

export type MiddlewareContext = {
  event: NextFetchEvent;
};

export type HelixMiddleware = (
  request: NextRequest,
  context: MiddlewareContext,
) => ReturnType<NextMiddleware>;

export const middlewares: HelixMiddleware[] = [requestHeadersMiddleware];

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export async function runMiddlewares(
  request: NextRequest,
  event: NextFetchEvent,
): Promise<Response> {
  for (const handler of middlewares) {
    const result = await handler(request, { event });

    if (isResponse(result)) {
      return result;
    }
  }

  return NextResponse.next();
}
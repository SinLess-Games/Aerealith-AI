import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { FRONTEND_FEATURE_FLAGS_HEADER, parseFrontendFeatureFlags } from '../../../../../lib/feature-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_AUTH_SIGNUP_PATH = '/api/V1/auth/signup';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

function getAuthSignupUrl(): string {
  const explicitSignupUrl =
    process.env.AUTH_SERVICE_SIGNUP_URL ?? process.env.AUTH_SIGNUP_URL;

  if (explicitSignupUrl) {
    return explicitSignupUrl;
  }

  const authServiceUrl =
    process.env.AUTH_SERVICE_INTERNAL_URL ?? process.env.AUTH_SERVICE_URL;

  if (!authServiceUrl) {
    throw new Error(
      'Missing AUTH_SERVICE_URL, AUTH_SERVICE_INTERNAL_URL, or AUTH_SERVICE_SIGNUP_URL.',
    );
  }

  return joinUrl(
    authServiceUrl,
    process.env.AUTH_SERVICE_SIGNUP_PATH ?? DEFAULT_AUTH_SIGNUP_PATH,
  );
}

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip')
  );
}

function createForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers();

  headers.set('Accept', 'application/json');
  headers.set(
    'Content-Type',
    request.headers.get('content-type') ?? 'application/json',
  );

  const cookie = request.headers.get('cookie');
  const userAgent = request.headers.get('user-agent');
  const forwardedFor = getClientIp(request);
  const forwardedHost = request.headers.get('host');
  const forwardedProto =
    request.headers.get('x-forwarded-proto') ??
    request.nextUrl.protocol.replace(':', '');

  if (cookie) {
    headers.set('Cookie', cookie);
  }

  if (userAgent) {
    headers.set('User-Agent', userAgent);
  }

  if (forwardedFor) {
    headers.set('X-Forwarded-For', forwardedFor);
  }

  if (forwardedHost) {
    headers.set('X-Forwarded-Host', forwardedHost);
  }

  if (forwardedProto) {
    headers.set('X-Forwarded-Proto', forwardedProto);
  }

  return headers;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const headersWithSetCookie = headers as HeadersWithSetCookie;

  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    return headersWithSetCookie.getSetCookie();
  }

  const setCookie = headers.get('set-cookie');

  return setCookie ? [setCookie] : [];
}

function createResponseHeaders(authResponse: Response): Headers {
  const headers = new Headers();

  authResponse.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey === 'set-cookie' ||
      HOP_BY_HOP_HEADERS.has(normalizedKey)
    ) {
      return;
    }

    headers.set(key, value);
  });

  headers.set('Cache-Control', 'no-store');

  for (const cookie of getSetCookieHeaders(authResponse.headers)) {
    headers.append('Set-Cookie', cookie);
  }

  return headers;
}

function createProxyErrorResponse(error: unknown): NextResponse {
  const message =
    error instanceof Error
      ? error.message
      : 'Unable to connect to the auth service.';

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: 502,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const featureFlags = parseFrontendFeatureFlags(
    request.headers.get(FRONTEND_FEATURE_FLAGS_HEADER),
  );

  if (featureFlags.registration === false) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FEATURE_DISABLED',
          message: 'Registration is currently disabled.',
        },
      },
      { status: 503 },
    );
  }

  try {
    const authResponse = await fetch(getAuthSignupUrl(), {
      method: 'POST',
      headers: createForwardHeaders(request),
      body: await request.text(),
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
    });

    return new NextResponse(await authResponse.text(), {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers: createResponseHeaders(authResponse),
    });
  } catch (error) {
    return createProxyErrorResponse(error);
  }
}
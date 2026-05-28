import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_AUTH_VERIFY_EMAIL_PATH = '/api/V1/auth/verify-email';

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

function appendSearchParams(url: string, request: NextRequest): string {
  const search = request.nextUrl.search;

  if (!search) {
    return url;
  }

  return `${url}${search}`;
}

function getAuthVerifyEmailUrl(request: NextRequest): string {
  const explicitVerifyEmailUrl =
    process.env.AUTH_SERVICE_VERIFY_EMAIL_URL ??
    process.env.AUTH_VERIFY_EMAIL_URL;

  if (explicitVerifyEmailUrl) {
    return appendSearchParams(explicitVerifyEmailUrl, request);
  }

  const authServiceUrl =
    process.env.AUTH_SERVICE_INTERNAL_URL ?? process.env.AUTH_SERVICE_URL;

  if (!authServiceUrl) {
    throw new Error(
      'Missing AUTH_SERVICE_URL, AUTH_SERVICE_INTERNAL_URL, or AUTH_SERVICE_VERIFY_EMAIL_URL.',
    );
  }

  return appendSearchParams(
    joinUrl(
      authServiceUrl,
      process.env.AUTH_SERVICE_VERIFY_EMAIL_PATH ??
        DEFAULT_AUTH_VERIFY_EMAIL_PATH,
    ),
    request,
  );
}

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip')
  );
}

function createForwardHeaders(request: NextRequest, hasBody: boolean): Headers {
  const headers = new Headers();

  headers.set('Accept', 'application/json');

  const contentType = request.headers.get('content-type');
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent');
  const requestId = request.headers.get('x-request-id');
  const forwardedFor = getClientIp(request);
  const forwardedHost = request.headers.get('host');
  const forwardedProto =
    request.headers.get('x-forwarded-proto') ??
    request.nextUrl.protocol.replace(':', '');

  if (hasBody) {
    headers.set('Content-Type', contentType ?? 'application/json');
  }

  if (cookie) {
    headers.set('Cookie', cookie);
  }

  if (authorization) {
    headers.set('Authorization', authorization);
  }

  if (userAgent) {
    headers.set('User-Agent', userAgent);
  }

  if (requestId) {
    headers.set('X-Request-Id', requestId);
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

async function createProxyResponse(
  authResponse: Response,
): Promise<NextResponse> {
  const headers = createResponseHeaders(authResponse);

  if (authResponse.status === 204 || authResponse.status === 304) {
    return new NextResponse(null, {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers,
    });
  }

  return new NextResponse(await authResponse.text(), {
    status: authResponse.status,
    statusText: authResponse.statusText,
    headers,
  });
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResponse = await fetch(getAuthVerifyEmailUrl(request), {
      method: 'GET',
      headers: createForwardHeaders(request, false),
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
    });

    return createProxyResponse(authResponse);
  } catch (error) {
    return createProxyErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const hasBody = body.length > 0;

    const authResponse = await fetch(getAuthVerifyEmailUrl(request), {
      method: 'POST',
      headers: createForwardHeaders(request, hasBody),
      body: hasBody ? body : undefined,
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
    });

    return createProxyResponse(authResponse);
  } catch (error) {
    return createProxyErrorResponse(error);
  }
}
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_AUTH_LOGOUT_PATH = '/auth/logout';

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

const COOKIE = {
  ACCESS_TOKEN: 'helix_access_token',
  REFRESH_TOKEN: 'helix_refresh_token',
  SESSION_ID: 'helix_session_id',
  USERNAME: 'helix_username',
} as const;

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

function getAuthLogoutUrl(): string {
  const explicitLogoutUrl =
    process.env.AUTH_SERVICE_LOGOUT_URL ?? process.env.AUTH_LOGOUT_URL;

  if (explicitLogoutUrl) {
    return explicitLogoutUrl;
  }

  const authServiceUrl =
    process.env.AUTH_SERVICE_INTERNAL_URL ?? process.env.AUTH_SERVICE_URL;

  if (!authServiceUrl) {
    throw new Error(
      'Missing AUTH_SERVICE_URL, AUTH_SERVICE_INTERNAL_URL, or AUTH_SERVICE_LOGOUT_URL.',
    );
  }

  return joinUrl(
    authServiceUrl,
    process.env.AUTH_SERVICE_LOGOUT_PATH ?? DEFAULT_AUTH_LOGOUT_PATH,
  );
}

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip')
  );
}

function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');

  if (forwardedProto) {
    return forwardedProto.toLowerCase() === 'https';
  }

  return request.nextUrl.protocol === 'https:';
}

function getCookieName(envKey: string, fallback: string): string {
  const value = process.env[envKey];

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function getAuthCookieNames(): {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  username: string;
} {
  return {
    accessToken: getCookieName(
      'AUTH_ACCESS_TOKEN_COOKIE_NAME',
      COOKIE.ACCESS_TOKEN,
    ),
    refreshToken: getCookieName(
      'AUTH_REFRESH_TOKEN_COOKIE_NAME',
      COOKIE.REFRESH_TOKEN,
    ),
    sessionId: getCookieName(
      'AUTH_SESSION_ID_COOKIE_NAME',
      COOKIE.SESSION_ID,
    ),
    username: getCookieName('AUTH_USERNAME_COOKIE_NAME', COOKIE.USERNAME),
  };
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
    headers.set('X-Forwarded-Hostname', forwardedHost);
  }

  if (forwardedProto) {
    headers.set('X-Forwarded-Proto', forwardedProto);
  }

  return headers;
}

function splitSetCookieHeader(value: string): string[] {
  return value
    .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function getSetCookieHeaders(headers: Headers): string[] {
  const headersWithSetCookie = headers as HeadersWithSetCookie;

  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    return headersWithSetCookie.getSetCookie();
  }

  const setCookie = headers.get('set-cookie');

  return setCookie ? splitSetCookieHeader(setCookie) : [];
}

function removeCookieAttribute(
  parts: string[],
  attributeName: string,
): string[] {
  const normalizedAttributeName = attributeName.toLowerCase();

  return parts.filter((part) => {
    const [name] = part.trim().split('=');

    return name?.toLowerCase() !== normalizedAttributeName;
  });
}

function upsertCookieAttribute(
  parts: string[],
  attributeName: string,
  attributeValue?: string,
): string[] {
  const normalizedAttributeName = attributeName.toLowerCase();
  const nextAttribute =
    typeof attributeValue === 'string'
      ? `${attributeName}=${attributeValue}`
      : attributeName;

  const existingIndex = parts.findIndex((part) => {
    const [name] = part.trim().split('=');

    return name?.toLowerCase() === normalizedAttributeName;
  });

  if (existingIndex >= 0) {
    return parts.map((part, index) =>
      index === existingIndex ? nextAttribute : part,
    );
  }

  return [...parts, nextAttribute];
}

function normalizeUpstreamSetCookie(
  cookie: string,
  request: NextRequest,
): string {
  const parts = cookie
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return cookie;
  }

  let nextParts = parts;

  nextParts = removeCookieAttribute(nextParts, 'Domain');
  nextParts = upsertCookieAttribute(nextParts, 'Path', '/');

  if (!isSecureRequest(request)) {
    nextParts = removeCookieAttribute(nextParts, 'Secure');
  }

  return nextParts.join('; ');
}

function createExpiredCookie(input: {
  name: string;
  request: NextRequest;
  httpOnly: boolean;
}): string {
  const parts = [
    `${input.name}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'SameSite=Lax',
  ];

  if (input.httpOnly) {
    parts.push('HttpOnly');
  }

  if (isSecureRequest(input.request)) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function appendExpiredAuthCookies(
  headers: Headers,
  request: NextRequest,
): void {
  const names = getAuthCookieNames();

  headers.append(
    'Set-Cookie',
    createExpiredCookie({
      name: names.accessToken,
      request,
      httpOnly: true,
    }),
  );

  headers.append(
    'Set-Cookie',
    createExpiredCookie({
      name: names.refreshToken,
      request,
      httpOnly: true,
    }),
  );

  headers.append(
    'Set-Cookie',
    createExpiredCookie({
      name: names.sessionId,
      request,
      httpOnly: true,
    }),
  );

  headers.append(
    'Set-Cookie',
    createExpiredCookie({
      name: names.username,
      request,
      httpOnly: false,
    }),
  );
}

function appendExpiredRequestCookies(
  headers: Headers,
  request: NextRequest,
): void {
  const authCookieNames = new Set(Object.values(getAuthCookieNames()));

  for (const cookie of request.cookies.getAll()) {
    if (authCookieNames.has(cookie.name)) {
      continue;
    }

    headers.append(
      'Set-Cookie',
      createExpiredCookie({
        name: cookie.name,
        request,
        httpOnly: false,
      }),
    );
  }
}

function createResponseHeaders(
  authResponse: Response,
  request: NextRequest,
): Headers {
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
    headers.append('Set-Cookie', normalizeUpstreamSetCookie(cookie, request));
  }

  appendExpiredAuthCookies(headers, request);
  appendExpiredRequestCookies(headers, request);

  return headers;
}

function createProxyErrorResponse(
  error: unknown,
  request: NextRequest,
): NextResponse {
  const message =
    error instanceof Error
      ? error.message
      : 'Unable to connect to the auth service.';

  const headers = new Headers({
    'Cache-Control': 'no-store',
  });

  appendExpiredAuthCookies(headers, request);
  appendExpiredRequestCookies(headers, request);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: 502,
      headers,
    },
  );
}

function createFallbackLogoutBody(request: NextRequest): string | undefined {
  const names = getAuthCookieNames();

  const refreshToken = request.cookies.get(names.refreshToken)?.value;
  const sessionId = request.cookies.get(names.sessionId)?.value;

  if (!refreshToken && !sessionId) {
    return undefined;
  }

  return JSON.stringify({
    ...(refreshToken ? { refreshToken } : {}),
    ...(sessionId ? { sessionId } : {}),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const requestBody = await request.text();
    const fallbackBody = requestBody.trim()
      ? undefined
      : createFallbackLogoutBody(request);

    const body = requestBody.trim() ? requestBody : fallbackBody;
    const hasBody = typeof body === 'string' && body.length > 0;

    const authResponse = await fetch(getAuthLogoutUrl(), {
      method: 'POST',
      headers: createForwardHeaders(request, hasBody),
      body: hasBody ? body : undefined,
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
    });

    return new NextResponse(await authResponse.arrayBuffer(), {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers: createResponseHeaders(authResponse, request),
    });
  } catch (error) {
    return createProxyErrorResponse(error, request);
  }
}

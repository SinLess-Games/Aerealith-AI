import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_AUTH_LOGIN_PATH = '/auth/login';
const PERSISTENT_LOGIN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

type RecordLike = Record<string, unknown>;

type AuthCookiePayload = {
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
  username?: string;
  maxAgeSeconds?: number;
};

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

function getAuthLoginUrl(): string {
  const explicitLoginUrl =
    process.env.AUTH_SERVICE_LOGIN_URL ?? process.env.AUTH_LOGIN_URL;

  if (explicitLoginUrl) {
    return explicitLoginUrl;
  }

  const authServiceUrl =
    process.env.AUTH_SERVICE_INTERNAL_URL ?? process.env.AUTH_SERVICE_URL;

  if (!authServiceUrl) {
    throw new Error(
      'Missing AUTH_SERVICE_URL, AUTH_SERVICE_INTERNAL_URL, or AUTH_SERVICE_LOGIN_URL.',
    );
  }

  return joinUrl(
    authServiceUrl,
    process.env.AUTH_SERVICE_LOGIN_PATH ?? DEFAULT_AUTH_LOGIN_PATH,
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
    headers.set('X-Forwarded-Hostname', forwardedHost);
  }

  if (forwardedProto) {
    headers.set('X-Forwarded-Proto', forwardedProto);
  }

  return headers;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNestedValue(value: unknown, path: readonly string[]): unknown {
  let current = value;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function readNestedString(
  value: unknown,
  paths: readonly (readonly string[])[],
): string | undefined {
  for (const path of paths) {
    const candidate = readNestedValue(value, path);

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function readNestedNumber(
  value: unknown,
  paths: readonly (readonly string[])[],
): number | undefined {
  for (const path of paths) {
    const candidate = readNestedValue(value, path);

    if (
      typeof candidate === 'number' &&
      Number.isFinite(candidate) &&
      candidate > 0
    ) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const parsed = Number(candidate);

      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return undefined;
}

function unwrapApiSuccessResponse(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if (value.success === true && 'data' in value) {
    return value.data;
  }

  return value;
}

function parseJsonResponseBody(
  body: ArrayBuffer,
  headers: Headers,
): unknown {
  const contentType = headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  try {
    const text = new TextDecoder().decode(body);

    if (!text.trim()) {
      return null;
    }

    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractAuthCookiePayload(value: unknown): AuthCookiePayload {
  const result = unwrapApiSuccessResponse(value);

  return {
    accessToken: readNestedString(result, [
      ['tokens', 'accessToken'],
      ['tokens', 'access_token'],
      ['tokens', 'access'],
      ['tokens', 'access', 'token'],
      ['accessToken'],
      ['access_token'],
    ]),
    refreshToken: readNestedString(result, [
      ['tokens', 'refreshToken'],
      ['tokens', 'refresh_token'],
      ['tokens', 'refresh'],
      ['tokens', 'refresh', 'token'],
      ['refreshToken'],
      ['refresh_token'],
    ]),
    sessionId: readNestedString(result, [
      ['session', 'id'],
      ['session', 'sessionId'],
      ['session', 'session_id'],
      ['sessionId'],
      ['session_id'],
    ]),
    username: readNestedString(result, [
      ['user', 'username'],
      ['username'],
      ['accessClaims', 'username'],
      ['refreshClaims', 'username'],
    ]),
    maxAgeSeconds:
      readNestedNumber(result, [
        ['persistentSession', 'cookieMaxAgeSeconds'],
        ['persistentSession', 'maxAgeSeconds'],
        ['session', 'maxAgeSeconds'],
      ]) ?? PERSISTENT_LOGIN_MAX_AGE_SECONDS,
  };
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

function getCookieHeaderName(cookie: string): string | null {
  const [nameValue] = cookie.split(';');
  const [name] = nameValue?.split('=') ?? [];

  const normalizedName = name?.trim();

  return normalizedName ? normalizedName.toLowerCase() : null;
}

function hasCookieAttribute(parts: string[], attributeName: string): boolean {
  const normalizedAttributeName = attributeName.toLowerCase();

  return parts.some((part) => {
    const [name] = part.trim().split('=');

    return name?.toLowerCase() === normalizedAttributeName;
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

function normalizeLoginSetCookie(cookie: string, request: NextRequest): string {
  const parts = cookie
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return cookie;
  }

  let nextParts = parts;

  // The proxy response is for localhost:3000 / helixaibot.com, not localhost:8787.
  nextParts = removeCookieAttribute(nextParts, 'Domain');

  // Make the cookie available to the whole frontend app, including /api/V1/users/{username}.
  nextParts = upsertCookieAttribute(nextParts, 'Path', '/');

  // Keep the browser login persistent after refresh/browser restart.
  if (!hasCookieAttribute(nextParts, 'Max-Age')) {
    nextParts = upsertCookieAttribute(
      nextParts,
      'Max-Age',
      String(PERSISTENT_LOGIN_MAX_AGE_SECONDS),
    );
  }

  if (!hasCookieAttribute(nextParts, 'Expires')) {
    nextParts = upsertCookieAttribute(
      nextParts,
      'Expires',
      new Date(
        Date.now() + PERSISTENT_LOGIN_MAX_AGE_SECONDS * 1000,
      ).toUTCString(),
    );
  }

  if (!hasCookieAttribute(nextParts, 'SameSite')) {
    nextParts = upsertCookieAttribute(nextParts, 'SameSite', 'Lax');
  }

  const secureRequest = isSecureRequest(request);

  if (secureRequest && !hasCookieAttribute(nextParts, 'Secure')) {
    nextParts = upsertCookieAttribute(nextParts, 'Secure');
  }

  // Local Next dev is http://localhost:3000. A Secure cookie will be ignored there.
  if (!secureRequest) {
    nextParts = removeCookieAttribute(nextParts, 'Secure');
  }

  return nextParts.join('; ');
}

function sanitizeCookieValue(value: string): string {
  return value.replace(/[\r\n;]/g, '');
}

function createPersistentCookie(input: {
  name: string;
  value: string;
  request: NextRequest;
  maxAgeSeconds: number;
  httpOnly: boolean;
}): string {
  const parts = [
    `${input.name}=${sanitizeCookieValue(input.value)}`,
    'Path=/',
    `Max-Age=${input.maxAgeSeconds}`,
    `Expires=${new Date(
      Date.now() + input.maxAgeSeconds * 1000,
    ).toUTCString()}`,
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

function createFallbackSetCookiesFromBody(
  body: unknown,
  request: NextRequest,
  existingCookieNames: Set<string>,
): string[] {
  const payload = extractAuthCookiePayload(body);
  const names = getAuthCookieNames();
  const maxAgeSeconds =
    payload.maxAgeSeconds ?? PERSISTENT_LOGIN_MAX_AGE_SECONDS;

  const cookies: string[] = [];

  const addCookie = (
    name: string,
    value: string | undefined,
    httpOnly: boolean,
  ): void => {
    if (!value || existingCookieNames.has(name.toLowerCase())) {
      return;
    }

    cookies.push(
      createPersistentCookie({
        name,
        value,
        request,
        maxAgeSeconds,
        httpOnly,
      }),
    );

    existingCookieNames.add(name.toLowerCase());
  };

  addCookie(names.accessToken, payload.accessToken, true);
  addCookie(names.refreshToken, payload.refreshToken, true);
  addCookie(names.sessionId, payload.sessionId, true);
  addCookie(names.username, payload.username, false);

  return cookies;
}

function createResponseHeaders(
  authResponse: Response,
  request: NextRequest,
  responseBodyJson: unknown,
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

  const existingCookieNames = new Set<string>();

  for (const cookie of getSetCookieHeaders(authResponse.headers)) {
    const normalizedCookie = normalizeLoginSetCookie(cookie, request);
    const cookieName = getCookieHeaderName(normalizedCookie);

    if (cookieName) {
      existingCookieNames.add(cookieName);
    }

    headers.append('Set-Cookie', normalizedCookie);
  }

  if (authResponse.ok) {
    for (const cookie of createFallbackSetCookiesFromBody(
      responseBodyJson,
      request,
      existingCookieNames,
    )) {
      headers.append('Set-Cookie', cookie);
    }
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
  try {
    const authResponse = await fetch(getAuthLoginUrl(), {
      method: 'POST',
      headers: createForwardHeaders(request),
      body: await request.text(),
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
    });

    const responseBody = await authResponse.arrayBuffer();
    const responseBodyJson = parseJsonResponseBody(
      responseBody,
      authResponse.headers,
    );

    return new NextResponse(responseBody, {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers: createResponseHeaders(authResponse, request, responseBodyJson),
    });
  } catch (error) {
    return createProxyErrorResponse(error);
  }
}
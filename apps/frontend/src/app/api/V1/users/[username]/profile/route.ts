import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAMES = [
  'helix_session_id',
  'helix_refresh_token',
  'helix_access_token',
] as const;
const USERNAME_COOKIE_NAME = 'helix_username';

const DEFAULT_USER_SERVICE_URL = 'http://localhost:8788';
const DEFAULT_USER_SERVICE_PROFILE_PATH_PREFIX = '/api/V1/users';

type RouteContext = {
  params: Promise<{ username: string }>;
};

function hasSession(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) =>
    Boolean(request.cookies.get(name)?.value),
  );
}

function getSessionUsername(request: NextRequest): string | undefined {
  return request.cookies.get(USERNAME_COOKIE_NAME)?.value?.trim() || undefined;
}

function getUserProfileUrl(username: string): string {
  const baseUrl =
    process.env.USER_SERVICE_INTERNAL_URL ??
    process.env.USER_SERVICE_URL ??
    DEFAULT_USER_SERVICE_URL;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const pathPrefix =
    process.env.USER_SERVICE_BASE_PATH ??
    DEFAULT_USER_SERVICE_PROFILE_PATH_PREFIX;

  return normalizeLoopbackUrl(
    `${normalizedBaseUrl}${pathPrefix}/${encodeURIComponent(username)}/profile`,
  );
}

function normalizeLoopbackUrl(value: string): string {
  if (process.env.NODE_ENV !== 'development') {
    return value;
  }

  try {
    const url = new URL(value);

    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
    }

    return url.toString();
  } catch {
    return value;
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  if (!hasSession(request)) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Login required.' } },
      { status: 401 },
    );
  }

  const { username } = await context.params;
  const sessionUsername = getSessionUsername(request);

  if (sessionUsername?.toLowerCase() !== username.toLowerCase()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only edit your own profile.',
        },
      },
      { status: 403 },
    );
  }

  const response = await fetch(getUserProfileUrl(username), {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-aerealith-auth-username': sessionUsername,
      'x-helix-username': sessionUsername,
    },
    body: await request.text(),
    cache: 'no-store',
  });

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    },
  });
}

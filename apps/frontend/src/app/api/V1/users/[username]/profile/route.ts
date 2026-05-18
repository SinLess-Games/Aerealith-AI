import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAMES = [
  'helix_session_id',
  'helix_refresh_token',
  'helix_access_token',
] as const;

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

function getUserProfileUrl(username: string): string {
  const baseUrl =
    process.env.USER_SERVICE_INTERNAL_URL ??
    process.env.USER_SERVICE_URL ??
    DEFAULT_USER_SERVICE_URL;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const pathPrefix =
    process.env.USER_SERVICE_BASE_PATH ??
    DEFAULT_USER_SERVICE_PROFILE_PATH_PREFIX;

  return `${normalizedBaseUrl}${pathPrefix}/${encodeURIComponent(username)}/profile`;
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
  const response = await fetch(getUserProfileUrl(username), {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
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

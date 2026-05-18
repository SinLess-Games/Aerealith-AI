import { Hono } from 'hono';
import type { Context, Handler } from 'hono';

import {
  AuthLoginSchemas,
  AuthRegisterSchemas,
  AuthSessionSchemas,
} from '@helix-ai/contracts';

import type {
  AuthRegisterResult,
  AuthService,
} from '../services/auth.service';
import type { AuthHonoEnv } from '../types/auth-context.type';

export type AuthEmailVerificationMailInput = {
  user: AuthRegisterResult['user'];
  emailVerificationToken: AuthRegisterResult['emailVerificationToken'];
  request: {
    origin?: string | undefined;
    userAgent?: string | undefined;
    ipAddress?: string | undefined;
  };
};

export type AuthEmailVerificationMailer = {
  sendEmailVerification: (
    input: AuthEmailVerificationMailInput,
  ) => Promise<void>;
};

export type AuthPublicRoutesOptions = {
  authService: AuthService;
  emailVerificationMailer?: AuthEmailVerificationMailer;
};

export type ApiSuccessResponse<TData> = {
  success: true;
  data: TData;
};

export type ApiValidationErrorResponse = {
  success: false;
  error: {
    code: 'VALIDATION_ERROR' | 'INVALID_JSON';
    message: string;
    details?: unknown;
  };
};

export type AuthRegisterPublicResponse = {
  user: AuthRegisterResult['user'];
  verification: {
    required: true;
    emailSent: boolean;
    message: string;
  };
};

type RecordLike = Record<string, unknown>;

type AuthCookiePayload = {
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
  username?: string;
  maxAgeSeconds?: number;
};

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
} as const;

const HEADER = {
  USER_AGENT: 'User-Agent',
  CF_CONNECTING_IP: 'CF-Connecting-IP',
  X_FORWARDED_FOR: 'X-Forwarded-For',
  X_REAL_IP: 'X-Real-IP',
  ORIGIN: 'Origin',
} as const;

const COOKIE = {
  ACCESS_TOKEN: 'helix_access_token',
  REFRESH_TOKEN: 'helix_refresh_token',
  SESSION_ID: 'helix_session_id',
  USERNAME: 'helix_username',
} as const;

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

const getFirstForwardedIp = (value: string | undefined): string | undefined => {
  const firstIp = value?.split(',')[0]?.trim();

  if (!firstIp) {
    return undefined;
  }

  return firstIp;
};

const getRequestMetadata = (c: {
  req: {
    header: (name: string) => string | undefined;
  };
}) => {
  return {
    userAgent: c.req.header(HEADER.USER_AGENT),
    ipAddress:
      c.req.header(HEADER.CF_CONNECTING_IP) ??
      getFirstForwardedIp(c.req.header(HEADER.X_FORWARDED_FOR)) ??
      c.req.header(HEADER.X_REAL_IP),
  };
};

const getRequestOrigin = (c: {
  req: {
    header: (name: string) => string | undefined;
  };
}): string | undefined => {
  return c.req.header(HEADER.ORIGIN);
};

const successResponse = <TData>(data: TData): ApiSuccessResponse<TData> => {
  return {
    success: true,
    data,
  };
};

const validationErrorResponse = (
  message: string,
  details?: unknown,
): ApiValidationErrorResponse => {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
};

const invalidJsonResponse = (): ApiValidationErrorResponse => {
  return {
    success: false,
    error: {
      code: 'INVALID_JSON',
      message: 'Request body must be valid JSON.',
    },
  };
};

const readJsonBody = async (c: {
  req: {
    json: () => Promise<unknown>;
  };
}): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
};

const createRegisterPublicResponse = (
  result: AuthRegisterResult,
  emailSent: boolean,
): AuthRegisterPublicResponse => {
  return {
    user: result.user,
    verification: {
      required: true,
      emailSent,
      message: emailSent
        ? 'Account created. Check your email to verify your account.'
        : 'Account created, but the verification email could not be sent. Try resending verification later.',
    },
  };
};

const createEmailVerificationMailRequest = (
  c: Context<AuthHonoEnv>,
): AuthEmailVerificationMailInput['request'] => {
  const metadata = getRequestMetadata(c);
  const origin = getRequestOrigin(c);

  return {
    ...(origin === undefined ? {} : { origin }),
    ...(metadata.userAgent === undefined
      ? {}
      : { userAgent: metadata.userAgent }),
    ...(metadata.ipAddress === undefined
      ? {}
      : { ipAddress: metadata.ipAddress }),
  };
};

const logEmailVerificationDeliveryFailure = (
  error: unknown,
  context: { operation: string; username: string },
): void => {
  const errorPayload =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
        }
      : {
          message: String(error),
        };

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Email verification delivery failed.',
      operation: context.operation,
      username: context.username,
      error: errorPayload,
    }),
  );
};

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEnvString(env: unknown, key: string): string | undefined {
  if (!isRecord(env)) {
    return undefined;
  }

  const value = env[key];

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
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

function getCookieName(
  env: unknown,
  envKey: string,
  fallback: string,
): string {
  return readEnvString(env, envKey) ?? fallback;
}

function isProductionEnv(env: unknown): boolean {
  return readEnvString(env, 'NODE_ENV') === 'production';
}

function sanitizeCookieValue(value: string): string {
  return value.replace(/[\r\n;]/g, '');
}

function createCookieHeader(input: {
  name: string;
  value: string;
  maxAgeSeconds: number;
  httpOnly: boolean;
  secure: boolean;
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

  if (input.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function createExpiredCookieHeader(input: {
  name: string;
  httpOnly: boolean;
  secure: boolean;
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

  if (input.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function extractAuthCookiePayload(result: unknown): AuthCookiePayload {
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
      ]) ?? THIRTY_DAYS_SECONDS,
  };
}

function createAuthCookieHeaders(
  env: unknown,
  result: unknown,
): string[] {
  const payload = extractAuthCookiePayload(result);
  const secure = isProductionEnv(env);
  const maxAgeSeconds = payload.maxAgeSeconds ?? THIRTY_DAYS_SECONDS;

  const cookies: string[] = [];

  const accessTokenCookieName = getCookieName(
    env,
    'AUTH_ACCESS_TOKEN_COOKIE_NAME',
    COOKIE.ACCESS_TOKEN,
  );
  const refreshTokenCookieName = getCookieName(
    env,
    'AUTH_REFRESH_TOKEN_COOKIE_NAME',
    COOKIE.REFRESH_TOKEN,
  );
  const sessionIdCookieName = getCookieName(
    env,
    'AUTH_SESSION_ID_COOKIE_NAME',
    COOKIE.SESSION_ID,
  );
  const usernameCookieName = getCookieName(
    env,
    'AUTH_USERNAME_COOKIE_NAME',
    COOKIE.USERNAME,
  );

  if (payload.accessToken) {
    cookies.push(
      createCookieHeader({
        name: accessTokenCookieName,
        value: payload.accessToken,
        maxAgeSeconds,
        httpOnly: true,
        secure,
      }),
    );
  }

  if (payload.refreshToken) {
    cookies.push(
      createCookieHeader({
        name: refreshTokenCookieName,
        value: payload.refreshToken,
        maxAgeSeconds,
        httpOnly: true,
        secure,
      }),
    );
  }

  if (payload.sessionId) {
    cookies.push(
      createCookieHeader({
        name: sessionIdCookieName,
        value: payload.sessionId,
        maxAgeSeconds,
        httpOnly: true,
        secure,
      }),
    );
  }

  if (payload.username) {
    cookies.push(
      createCookieHeader({
        name: usernameCookieName,
        value: payload.username,
        maxAgeSeconds,
        httpOnly: false,
        secure,
      }),
    );
  }

  return cookies;
}

function createClearAuthCookieHeaders(env: unknown): string[] {
  const secure = isProductionEnv(env);

  return [
    createExpiredCookieHeader({
      name: getCookieName(
        env,
        'AUTH_ACCESS_TOKEN_COOKIE_NAME',
        COOKIE.ACCESS_TOKEN,
      ),
      httpOnly: true,
      secure,
    }),
    createExpiredCookieHeader({
      name: getCookieName(
        env,
        'AUTH_REFRESH_TOKEN_COOKIE_NAME',
        COOKIE.REFRESH_TOKEN,
      ),
      httpOnly: true,
      secure,
    }),
    createExpiredCookieHeader({
      name: getCookieName(
        env,
        'AUTH_SESSION_ID_COOKIE_NAME',
        COOKIE.SESSION_ID,
      ),
      httpOnly: true,
      secure,
    }),
    createExpiredCookieHeader({
      name: getCookieName(env, 'AUTH_USERNAME_COOKIE_NAME', COOKIE.USERNAME),
      httpOnly: false,
      secure,
    }),
  ];
}

function createJsonResponse<TData>(
  data: TData,
  status: number,
  cookieHeaders: string[] = [],
): Response {
  const response = new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

  for (const cookie of cookieHeaders) {
    response.headers.append('Set-Cookie', cookie);
  }

  return response;
}

export const createAuthPublicRoutes = ({
  authService,
  emailVerificationMailer,
}: AuthPublicRoutesOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  const handleRegister: Handler<AuthHonoEnv> = async (c) => {
    const body = await readJsonBody(c);

    if (body === undefined) {
      return createJsonResponse(
        invalidJsonResponse(),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const parsed = AuthRegisterSchemas.authRegisterSchema.safeParse(body);

    if (!parsed.success) {
      return createJsonResponse(
        validationErrorResponse('Registration request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.register(
      parsed.data,
      getRequestMetadata(c),
    );

    let emailSent = false;

    if (emailVerificationMailer !== undefined) {
      try {
        await emailVerificationMailer.sendEmailVerification({
          user: result.user,
          emailVerificationToken: result.emailVerificationToken,
          request: createEmailVerificationMailRequest(c),
        });

        emailSent = true;
      } catch (error) {
        logEmailVerificationDeliveryFailure(error, {
          operation: 'register',
          username: result.user.username,
        });
      }
    }

    return createJsonResponse(
      successResponse(createRegisterPublicResponse(result, emailSent)),
      HTTP_STATUS.CREATED,
    );
  };

  routes.post('/register', handleRegister);
  routes.post('/signup', handleRegister);

  routes.post('/login', async (c) => {
    const body = await readJsonBody(c);

    if (body === undefined) {
      return createJsonResponse(
        invalidJsonResponse(),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const parsed = AuthLoginSchemas.authLoginSchema.safeParse(body);

    if (!parsed.success) {
      return createJsonResponse(
        validationErrorResponse('Login request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.login(parsed.data, getRequestMetadata(c));

    return createJsonResponse(
      successResponse(result),
      HTTP_STATUS.OK,
      createAuthCookieHeaders(c.env, result),
    );
  });

  routes.post('/refresh', async (c) => {
    const body = await readJsonBody(c);

    if (body === undefined) {
      return createJsonResponse(
        invalidJsonResponse(),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const parsed = AuthSessionSchemas.authRefreshSchema.safeParse(body);

    if (!parsed.success) {
      return createJsonResponse(
        validationErrorResponse('Refresh request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.refresh(
      parsed.data,
      getRequestMetadata(c),
    );

    return createJsonResponse(
      successResponse(result),
      HTTP_STATUS.OK,
      createAuthCookieHeaders(c.env, result),
    );
  });

  routes.post('/logout', async (c) => {
    const clearCookieHeaders = createClearAuthCookieHeaders(c.env);
    const body = await readJsonBody(c);

    if (body === undefined) {
      return createJsonResponse(
        successResponse({
          revoked: false,
          reason: 'No logout body was provided. Cookies were cleared.',
        }),
        HTTP_STATUS.OK,
        clearCookieHeaders,
      );
    }

    const parsed = AuthSessionSchemas.authLogoutSchema.safeParse(body);

    if (!parsed.success) {
      return createJsonResponse(
        validationErrorResponse('Logout request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
        clearCookieHeaders,
      );
    }

    const result = await authService.logout(parsed.data);

    return createJsonResponse(
      successResponse(result),
      HTTP_STATUS.OK,
      clearCookieHeaders,
    );
  });

  return routes;
};

export { createAuthPublicRoutes as authPublicRoutes };
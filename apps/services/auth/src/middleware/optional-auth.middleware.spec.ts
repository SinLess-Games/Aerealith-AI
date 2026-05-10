import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import { AuthError } from '@helix-ai/api';
import { AUTH_USER_STATUS } from '@helix-ai/contracts';

import {
  createAuthenticatedAuthContext,
  getAuthContext,
  isAnonymousAuthContext,
  isAuthenticatedAuthContext,
  setAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
} from '../types/auth-context.type';
import {
  AUTH_TOKEN_SCOPE,
  AUTH_TOKEN_TYPE,
  type AuthAccessTokenClaims,
  type AuthTokenString,
} from '../types/auth-token.type';

const authContextMiddlewareMockState = vi.hoisted(() => {
  return {
    authContextMiddleware: vi.fn(),
  };
});

vi.mock('./auth-context.middleware', () => {
  return {
    authContextMiddleware: authContextMiddlewareMockState.authContextMiddleware,
  };
});

import {
  createOptionalAuthMiddleware,
  optionalAuthMiddleware,
} from './optional-auth.middleware';
import { authContextMiddleware } from './auth-context.middleware';

const TEST_USER_ID = 'user_123';
const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_SESSION_ID = 'session_123';
const TEST_ACCESS_TOKEN = 'test.access.token' as AuthTokenString;

type MockAuthContextMiddlewareOptions = {
  behavior?: 'anonymous' | 'authenticated' | 'auth-error' | 'non-auth-error';
  onDownstreamErrorRoute?: boolean;
  strict?: boolean;
  onAuthError?: (
    error: unknown,
    context: AuthContextHonoContext,
  ) => void | Promise<void>;
};

const createAccessClaims = (): AuthAccessTokenClaims => {
  return {
    id: 'access_jti_123',
    userId: TEST_USER_ID,
    username: TEST_USERNAME,
    sessionId: TEST_SESSION_ID,
    type: AUTH_TOKEN_TYPE.ACCESS,
    scopes: [
      AUTH_TOKEN_SCOPE.AUTH_READ,
      AUTH_TOKEN_SCOPE.USER_READ,
      AUTH_TOKEN_SCOPE.SESSION_READ,
    ],
    issuer: 'helix-auth-test',
    audience: 'helix-api-test',
    issuedAt: 1_777_980_000,
    expiresAt: 1_777_980_900,
  };
};

const createTestAuthContext = () => {
  const claims = createAccessClaims();

  return createAuthenticatedAuthContext({
    user: {
      id: TEST_USER_ID,
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      emailVerified: true,
      status: AUTH_USER_STATUS.ACTIVE,
      createdAt: new Date('2026-05-09T12:00:00.000Z'),
      updatedAt: new Date('2026-05-09T12:30:00.000Z'),
      sessionId: TEST_SESSION_ID,
    },
    session: {
      id: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      username: TEST_USERNAME,
      expiresAt: new Date('2026-05-09T12:15:00.000Z'),
      revokedAt: null,
      createdAt: new Date('2026-05-09T12:00:00.000Z'),
      updatedAt: new Date('2026-05-09T12:30:00.000Z'),
    },
    token: {
      raw: TEST_ACCESS_TOKEN,
      type: AUTH_TOKEN_TYPE.ACCESS,
      scopes: claims.scopes,
      claims,
    },
    claims,
  });
};

const createAuthContextMiddlewareImplementation = (
  behavior: MockAuthContextMiddlewareOptions['behavior'] = 'anonymous',
): MiddlewareHandler<AuthHonoEnv> => {
  return async (c, next) => {
    const context = c as AuthContextHonoContext;

    if (behavior === 'auth-error') {
      throw AuthError.tokenInvalid('Optional auth token is invalid.');
    }

    if (behavior === 'non-auth-error') {
      throw new Error('Unexpected middleware failure.');
    }

    if (behavior === 'authenticated') {
      setAuthenticatedAuthContext(context, createTestAuthContext());
    }

    return next();
  };
};

const createTestApp = ({
  behavior = 'anonymous',
  onDownstreamErrorRoute = false,
  strict = false,
  onAuthError,
}: MockAuthContextMiddlewareOptions = {}): Hono<AuthHonoEnv> => {
  const app = new Hono<AuthHonoEnv>();

  app.onError((error, c) => {
    const record = error as unknown as Record<string, unknown>;

    return c.json(
      {
        success: false,
        error: {
          name: error.name,
          message: error.message,
          code: record.code,
        },
      },
      500,
    );
  });

  authContextMiddlewareMockState.authContextMiddleware.mockReturnValue(
    createAuthContextMiddlewareImplementation(behavior),
  );

  app.use(
    '*',
    optionalAuthMiddleware({
      userRepository: {} as never,
      sessionRepository: {} as never,
      tokenService: {} as never,
      strict,
      onAuthError,
    }),
  );

  app.get('/context', (c) => {
    const context = c as AuthContextHonoContext;
    const auth = getAuthContext(context);

    if (isAuthenticatedAuthContext(auth)) {
      return c.json({
        success: true,
        data: {
          authenticated: true,
          username: auth.user.username,
          sessionId: auth.session.id,
          tokenType: auth.token.type,
        },
      });
    }

    if (isAnonymousAuthContext(auth)) {
      return c.json({
        success: true,
        data: {
          authenticated: false,
        },
      });
    }

    return c.json(
      {
        success: false,
        error: {
          message: 'Auth context was not initialized.',
        },
      },
      500,
    );
  });

  app.get('/throws', () => {
    if (onDownstreamErrorRoute) {
      throw new Error('Downstream route failed.');
    }

    return new Response('ok');
  });

  return app;
};

describe('optionalAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports createOptionalAuthMiddleware as an alias', () => {
    expect(createOptionalAuthMiddleware).toBe(optionalAuthMiddleware);
  });

  it('registers authContextMiddleware with requireSession disabled', async () => {
    const app = createTestApp();

    const response = await app.request('/context');

    expect(response.status).toBe(200);
    expect(authContextMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        userRepository: expect.any(Object),
        sessionRepository: expect.any(Object),
        tokenService: expect.any(Object),
        requireSession: false,
      }),
    );
  });

  it('sets anonymous auth context when optional auth does not authenticate the request', async () => {
    const app = createTestApp({
      behavior: 'anonymous',
    });

    const response = await app.request('/context');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        authenticated: false,
      },
    });
  });

  it('preserves authenticated auth context when authContextMiddleware authenticates the request', async () => {
    const app = createTestApp({
      behavior: 'authenticated',
    });

    const response = await app.request('/context');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        authenticated: true,
        username: TEST_USERNAME,
        sessionId: TEST_SESSION_ID,
        tokenType: AUTH_TOKEN_TYPE.ACCESS,
      },
    });
  });

  it('falls back to anonymous auth when authContextMiddleware throws an AuthError before downstream middleware', async () => {
    const onAuthError = vi.fn();
    const app = createTestApp({
      behavior: 'auth-error',
      onAuthError,
    });

    const response = await app.request('/context');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        authenticated: false,
      },
    });

    expect(onAuthError).toHaveBeenCalledOnce();

    const [error, context] = onAuthError.mock.calls[0] ?? [];

    expect(error).toBeInstanceOf(AuthError);
    expect(context).toBeDefined();
  });

  it('awaits an async onAuthError hook before continuing as anonymous', async () => {
    const calls: string[] = [];
    const onAuthError = vi.fn(async () => {
      calls.push('onAuthError');
    });

    const app = createTestApp({
      behavior: 'auth-error',
      onAuthError,
    });

    const response = await app.request('/context');

    expect(response.status).toBe(200);
    expect(calls).toEqual(['onAuthError']);
    expect(onAuthError).toHaveBeenCalledOnce();
  });

  it('throws auth errors instead of falling back when strict mode is enabled', async () => {
    const onAuthError = vi.fn();
    const app = createTestApp({
      behavior: 'auth-error',
      strict: true,
      onAuthError,
    });

    const response = await app.request('/context');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Optional auth token is invalid.',
      },
    });

    expect(onAuthError).not.toHaveBeenCalled();
  });

  it('throws non-auth errors instead of falling back to anonymous auth', async () => {
    const onAuthError = vi.fn();
    const app = createTestApp({
      behavior: 'non-auth-error',
      onAuthError,
    });

    const response = await app.request('/context');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Unexpected middleware failure.',
      },
    });

    expect(onAuthError).not.toHaveBeenCalled();
  });

  it('does not swallow downstream route errors after auth middleware has reached next()', async () => {
    const onAuthError = vi.fn();
    const app = createTestApp({
      behavior: 'anonymous',
      onAuthError,
      onDownstreamErrorRoute: true,
    });

    const response = await app.request('/throws');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Downstream route failed.',
      },
    });

    expect(onAuthError).not.toHaveBeenCalled();
  });

  it('does not swallow downstream errors after authenticated optional auth', async () => {
    const onAuthError = vi.fn();
    const app = createTestApp({
      behavior: 'authenticated',
      onAuthError,
      onDownstreamErrorRoute: true,
    });

    const response = await app.request('/throws');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Downstream route failed.',
      },
    });

    expect(onAuthError).not.toHaveBeenCalled();
  });
});

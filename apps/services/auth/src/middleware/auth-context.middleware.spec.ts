import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { User, UserSession } from '@helix-ai/db';
import { AUTH_USER_STATUS } from '@helix-ai/contracts';

import {
  authContextMiddleware,
  createAuthContextMiddleware,
} from './auth-context.middleware';
import type { UserRepository } from '../repositories/user.repository';
import type { SessionRepository } from '../repositories/session.repository';
import type { TokenService } from '../services/token.service';
import {
  getAuthContext,
  isAnonymousAuthContext,
  isAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
} from '../types/auth-context.type';
import {
  AUTH_TOKEN_SCOPE,
  AUTH_TOKEN_TYPE,
  type AuthAccessTokenClaims,
  type AuthTokenString,
} from '../types/auth-token.type';

const TEST_USER_ID = 'user_123';
const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_SESSION_ID = 'session_123';
const TEST_ACCESS_TOKEN = 'test.access.token' as AuthTokenString;

const TEST_CREATED_AT = new Date('2026-05-09T12:00:00.000Z');
const TEST_UPDATED_AT = new Date('2026-05-09T12:30:00.000Z');
const TEST_SESSION_EXPIRES_AT = new Date('2099-05-09T13:00:00.000Z');
const TEST_EXPIRED_SESSION_EXPIRES_AT = new Date('2020-01-01T00:00:00.000Z');

type MockUserRepository = {
  findById: ReturnType<typeof vi.fn>;
};

type MockSessionRepository = {
  findActiveById: ReturnType<typeof vi.fn>;
};

type MockTokenService = {
  assertAccessToken: ReturnType<typeof vi.fn>;
};

type TestAppOptions = {
  authorization?: string;
  user?: User | null;
  session?: UserSession | null;
  claims?: AuthAccessTokenClaims;
  tokenError?: Error;
  requireSession?: boolean;
};

const createAccessClaims = (
  overrides: Partial<AuthAccessTokenClaims> = {},
): AuthAccessTokenClaims => {
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
    ...overrides,
  };
};

const createTestUser = (
  overrides: Partial<Record<string, unknown>> = {},
): User => {
  return {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    emailVerified: true,
    status: AUTH_USER_STATUS.ACTIVE,
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as User;
};

const createTestSession = (
  overrides: Partial<Record<string, unknown>> = {},
): UserSession => {
  return {
    id: TEST_SESSION_ID,
    user: {
      id: TEST_USER_ID,
      username: TEST_USERNAME,
    },
    sessionToken: 'persisted-refresh-token-hash',
    deviceName: 'Firefox on Linux',
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    lastSeenAt: TEST_UPDATED_AT,
    expires: TEST_SESSION_EXPIRES_AT,
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as UserSession;
};

const createMockUserRepository = (
  user: User | null = createTestUser(),
): MockUserRepository => {
  return {
    findById: vi.fn(async () => user),
  };
};

const createMockSessionRepository = (
  session: UserSession | null = createTestSession(),
): MockSessionRepository => {
  return {
    findActiveById: vi.fn(async () => session),
  };
};

const createMockTokenService = ({
  claims = createAccessClaims(),
  tokenError,
}: {
  claims?: AuthAccessTokenClaims;
  tokenError?: Error;
} = {}): MockTokenService => {
  return {
    assertAccessToken: vi.fn(async () => {
      if (tokenError !== undefined) {
        throw tokenError;
      }

      return claims;
    }),
  };
};

const createTestApp = ({
  authorization,
  user = createTestUser(),
  session = createTestSession(),
  claims = createAccessClaims(),
  tokenError,
  requireSession = true,
}: TestAppOptions = {}) => {
  const app = new Hono<AuthHonoEnv>();
  const userRepository = createMockUserRepository(user);
  const sessionRepository = createMockSessionRepository(session);
  const tokenService = createMockTokenService({
    claims,
    tokenError,
  });

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
      401,
    );
  });

  app.use(
    '*',
    authContextMiddleware({
      userRepository: userRepository as unknown as UserRepository,
      sessionRepository: sessionRepository as unknown as SessionRepository,
      tokenService: tokenService as unknown as TokenService,
      requireSession,
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
          user: {
            id: auth.user.id,
            username: auth.user.username,
            email: auth.user.email,
            emailVerified: auth.user.emailVerified,
            status: auth.user.status,
            sessionId: auth.user.sessionId,
          },
          session: {
            id: auth.session.id,
            userId: auth.session.userId,
            username: auth.session.username,
            expiresAt: auth.session.expiresAt?.toISOString() ?? null,
            revokedAt: auth.session.revokedAt?.toISOString() ?? null,
          },
          token: {
            raw: auth.token.raw,
            type: auth.token.type,
            scopes: auth.token.scopes,
          },
          claims: {
            userId: auth.claims.userId,
            username: auth.claims.username,
            sessionId: auth.claims.sessionId,
            type: auth.claims.type,
          },
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

  const headers =
    authorization === undefined
      ? undefined
      : {
          Authorization: authorization,
        };

  return {
    app,
    headers,
    userRepository,
    sessionRepository,
    tokenService,
  };
};

describe('authContextMiddleware', () => {
  it('exports createAuthContextMiddleware as an alias', () => {
    expect(createAuthContextMiddleware).toBe(authContextMiddleware);
  });

  it('sets anonymous auth context when Authorization is missing', async () => {
    const { app, userRepository, sessionRepository, tokenService } =
      createTestApp();

    const response = await app.request('/context');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        authenticated: false,
      },
    });

    expect(tokenService.assertAccessToken).not.toHaveBeenCalled();
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(sessionRepository.findActiveById).not.toHaveBeenCalled();
  });

  it('sets anonymous auth context when Authorization is blank', async () => {
    const { app, headers, tokenService } = createTestApp({
      authorization: '   ',
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        authenticated: false,
      },
    });

    expect(tokenService.assertAccessToken).not.toHaveBeenCalled();
  });

  it('sets authenticated auth context for a valid bearer access token', async () => {
    const { app, headers, userRepository, sessionRepository, tokenService } =
      createTestApp({
        authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        authenticated: true,
        user: {
          id: TEST_USER_ID,
          username: TEST_USERNAME,
          email: TEST_EMAIL,
          emailVerified: true,
          status: AUTH_USER_STATUS.ACTIVE,
          sessionId: TEST_SESSION_ID,
        },
        session: {
          id: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          username: TEST_USERNAME,
          expiresAt: TEST_SESSION_EXPIRES_AT.toISOString(),
          revokedAt: null,
        },
        token: {
          raw: TEST_ACCESS_TOKEN,
          type: AUTH_TOKEN_TYPE.ACCESS,
          scopes: [
            AUTH_TOKEN_SCOPE.AUTH_READ,
            AUTH_TOKEN_SCOPE.USER_READ,
            AUTH_TOKEN_SCOPE.SESSION_READ,
          ],
        },
        claims: {
          userId: TEST_USER_ID,
          username: TEST_USERNAME,
          sessionId: TEST_SESSION_ID,
          type: AUTH_TOKEN_TYPE.ACCESS,
        },
      },
    });

    expect(tokenService.assertAccessToken).toHaveBeenCalledWith(
      TEST_ACCESS_TOKEN,
    );
    expect(userRepository.findById).toHaveBeenCalledWith(TEST_USER_ID);
    expect(sessionRepository.findActiveById).toHaveBeenCalledWith(
      TEST_SESSION_ID,
    );
  });

  it('accepts a lowercase bearer scheme', async () => {
    const { app, headers } = createTestApp({
      authorization: `bearer ${TEST_ACCESS_TOKEN}`,
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        authenticated: true,
      },
    });
  });

  it('rejects a non-bearer Authorization scheme', async () => {
    const { app, headers, tokenService } = createTestApp({
      authorization: `Basic ${TEST_ACCESS_TOKEN}`,
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Authorization header must use the Bearer scheme.',
      },
    });

    expect(tokenService.assertAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a malformed bearer Authorization header with no token', async () => {
    const { app, headers, tokenService } = createTestApp({
      authorization: 'Bearer',
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Authorization Bearer token is malformed.',
      },
    });

    expect(tokenService.assertAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a malformed bearer Authorization header with extra parts', async () => {
    const { app, headers, tokenService } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN} extra`,
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Authorization Bearer token is malformed.',
      },
    });

    expect(tokenService.assertAccessToken).not.toHaveBeenCalled();
  });

  it('rejects when token verification fails', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      tokenError: new Error('Access token failed verification.'),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Access token failed verification.',
      },
    });
  });

  it('rejects when the token user cannot be found', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      user: null,
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejects disabled users', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      user: createTestUser({
        status: AUTH_USER_STATUS.DISABLED,
      }),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejects locked users', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      user: createTestUser({
        status: AUTH_USER_STATUS.LOCKED,
      }),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejects deleted users', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      user: createTestUser({
        status: AUTH_USER_STATUS.DELETED,
      }),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejects DB-only suspended users', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      user: createTestUser({
        status: 'suspended',
      }),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejects when requireSession is true and no active session exists', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      session: null,
      requireSession: true,
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('falls back to anonymous when requireSession is false and no active session exists', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      session: null,
      requireSession: false,
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        authenticated: false,
      },
    });
  });

  it('rejects when the session id does not match access token claims', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      session: createTestSession({
        id: 'different_session',
      }),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Access token session does not match.',
      },
    });
  });

  it('rejects when the session user does not match access token claims', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      session: createTestSession({
        user: {
          id: 'other_user',
          username: 'other-user',
        },
      }),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Access token user does not match session.',
      },
    });
  });

  it('accepts session user stored as a matching string id', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      session: createTestSession({
        user: TEST_USER_ID,
      }),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        authenticated: true,
        session: {
          userId: TEST_USER_ID,
        },
      },
    });
  });

  it('rejects expired sessions', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      session: createTestSession({
        expires: TEST_EXPIRED_SESSION_EXPIRES_AT,
      }),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('maps unknown user statuses to active in the auth context response', async () => {
    const { app, headers } = createTestApp({
      authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
      user: createTestUser({
        status: 'unknown-status',
      }),
    });

    const response = await app.request('/context', {
      headers,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        authenticated: true,
        user: {
          status: AUTH_USER_STATUS.ACTIVE,
        },
      },
    });
  });
});

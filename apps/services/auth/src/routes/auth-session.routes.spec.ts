import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import { AUTH_USER_STATUS } from '@aerealith-ai/contracts';

import {
  authSessionRoutes,
  createAuthSessionRoutes,
} from './auth-session.routes';
import type { AuthService } from '../services/auth.service';
import {
  createAuthenticatedAuthContext,
  setAnonymousAuthContext,
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

const TEST_USER_ID = 'user_123';
const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_SESSION_ID = 'session_123';
const TEST_OTHER_SESSION_ID = 'session_456';
const TEST_ACCESS_TOKEN = 'test.access.token' as AuthTokenString;

type TestAppOptions = {
  authenticated?: boolean;
  authenticatedUsername?: string;
  authService?: MockAuthService;
};

type MockAuthService = {
  listSessionsForUsername: ReturnType<typeof vi.fn>;
  revokeSessionForUsername: ReturnType<typeof vi.fn>;
};

const createAccessClaims = (
  username = TEST_USERNAME,
): AuthAccessTokenClaims => {
  return {
    id: 'access_jti_123',
    userId: TEST_USER_ID,
    username,
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

const createSessionResponse = (
  sessionId = TEST_SESSION_ID,
  overrides: Partial<Record<string, unknown>> = {},
) => {
  return {
    id: sessionId,
    userId: TEST_USER_ID,
    deviceName: 'Firefox on Linux',
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    createdAt: '2026-05-09T12:00:00.000Z',
    updatedAt: '2026-05-09T12:30:00.000Z',
    lastSeenAt: '2026-05-09T12:30:00.000Z',
    expiresAt: '2026-06-08T12:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
};

const createListSessionsResponse = () => {
  return {
    sessions: [
      createSessionResponse(TEST_SESSION_ID),
      createSessionResponse(TEST_OTHER_SESSION_ID, {
        deviceName: 'Mobile Safari',
      }),
    ],
  };
};

const createRevokeSessionResponse = (sessionId = TEST_SESSION_ID) => {
  return {
    revoked: true,
    sessionId,
    revokedAt: '2026-05-09T13:00:00.000Z',
  };
};

const createMockAuthService = (): MockAuthService => {
  return {
    listSessionsForUsername: vi.fn(async () => createListSessionsResponse()),
    revokeSessionForUsername: vi.fn(
      async (_authenticated, _requested, sessionId) =>
        createRevokeSessionResponse(sessionId),
    ),
  };
};

const setTestAuthenticatedContext = (
  context: AuthContextHonoContext,
  username = TEST_USERNAME,
): void => {
  const claims = createAccessClaims(username);

  setAuthenticatedAuthContext(
    context,
    createAuthenticatedAuthContext({
      user: {
        id: TEST_USER_ID,
        username,
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
        username,
        expiresAt: new Date('2026-06-08T12:00:00.000Z'),
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
    }),
  );
};

const createTestApp = ({
  authenticated = true,
  authenticatedUsername = TEST_USERNAME,
  authService = createMockAuthService(),
}: TestAppOptions = {}) => {
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
      401,
    );
  });

  app.use('*', async (c, next) => {
    const context = c as AuthContextHonoContext;

    if (!authenticated) {
      setAnonymousAuthContext(context);

      return next();
    }

    setTestAuthenticatedContext(context, authenticatedUsername);

    return next();
  });

  app.route(
    '/',
    createAuthSessionRoutes({
      authService: authService as unknown as AuthService,
    }),
  );

  return {
    app,
    authService,
  };
};

describe('auth-session.routes', () => {
  it('exports authSessionRoutes as an alias for createAuthSessionRoutes', () => {
    expect(authSessionRoutes).toBe(createAuthSessionRoutes);
  });

  it('handles GET /:username/sessions for the authenticated username', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(`/${TEST_USERNAME}/sessions`);

    expect(response.status).toBe(200);
    expect(authService.listSessionsForUsername).toHaveBeenCalledWith(
      TEST_USERNAME,
      TEST_USERNAME,
      {
        includeExpired: false,
        includeRevoked: false,
      },
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      data: createListSessionsResponse(),
    });
  });

  it('passes parsed session-list query options into AuthService', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(
      `/${TEST_USERNAME}/sessions?includeExpired=true&includeRevoked=true`,
    );

    expect(response.status).toBe(200);
    expect(authService.listSessionsForUsername).toHaveBeenCalledWith(
      TEST_USERNAME,
      TEST_USERNAME,
      {
        includeExpired: true,
        includeRevoked: true,
      },
    );
  });

  it('normalizes the requested username before listing sessions', async () => {
    const { app, authService } = createTestApp({
      authenticatedUsername: TEST_USERNAME,
    });

    const response = await app.request('/SinLess777/sessions');

    expect(response.status).toBe(200);
    expect(authService.listSessionsForUsername).toHaveBeenCalledWith(
      TEST_USERNAME,
      TEST_USERNAME,
      {
        includeExpired: false,
        includeRevoked: false,
      },
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      data: createListSessionsResponse(),
    });
  });

  it('coerces non-empty invalid session-list query values to true', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(
      `/${TEST_USERNAME}/sessions?includeExpired=not-a-boolean&includeRevoked=not-a-boolean`,
    );

    expect(response.status).toBe(200);
    expect(authService.listSessionsForUsername).toHaveBeenCalledWith(
      TEST_USERNAME,
      TEST_USERNAME,
      {
        includeExpired: true,
        includeRevoked: true,
      },
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      data: createListSessionsResponse(),
    });
  });

  it('handles DELETE /:username/sessions/:sessionId for the authenticated username', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(
      `/${TEST_USERNAME}/sessions/${TEST_SESSION_ID}`,
      {
        method: 'DELETE',
      },
    );

    expect(response.status).toBe(200);
    expect(authService.revokeSessionForUsername).toHaveBeenCalledWith(
      TEST_USERNAME,
      TEST_USERNAME,
      TEST_SESSION_ID,
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      data: createRevokeSessionResponse(TEST_SESSION_ID),
    });
  });

  it('passes the requested session id into revokeSessionForUsername', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(
      `/${TEST_USERNAME}/sessions/${TEST_OTHER_SESSION_ID}`,
      {
        method: 'DELETE',
      },
    );

    expect(response.status).toBe(200);
    expect(authService.revokeSessionForUsername).toHaveBeenCalledWith(
      TEST_USERNAME,
      TEST_USERNAME,
      TEST_OTHER_SESSION_ID,
    );
  });

  it('normalizes the requested username before revoking a session', async () => {
    const { app, authService } = createTestApp({
      authenticatedUsername: TEST_USERNAME,
    });

    const response = await app.request(
      `/SinLess777/sessions/${TEST_SESSION_ID}`,
      {
        method: 'DELETE',
      },
    );

    expect(response.status).toBe(200);
    expect(authService.revokeSessionForUsername).toHaveBeenCalledWith(
      TEST_USERNAME,
      TEST_USERNAME,
      TEST_SESSION_ID,
    );
  });

  it('rejects anonymous requests before listing sessions', async () => {
    const { app, authService } = createTestApp({
      authenticated: false,
    });

    const response = await app.request(`/${TEST_USERNAME}/sessions`);

    expect(response.status).toBe(401);
    expect(authService.listSessionsForUsername).not.toHaveBeenCalled();

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejects anonymous requests before revoking a session', async () => {
    const { app, authService } = createTestApp({
      authenticated: false,
    });

    const response = await app.request(
      `/${TEST_USERNAME}/sessions/${TEST_SESSION_ID}`,
      {
        method: 'DELETE',
      },
    );

    expect(response.status).toBe(401);
    expect(authService.revokeSessionForUsername).not.toHaveBeenCalled();

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejects list requests for a different username through requireUsernameAuthMiddleware', async () => {
    const { app, authService } = createTestApp({
      authenticatedUsername: TEST_USERNAME,
    });

    const response = await app.request('/other-user/sessions');

    expect(response.status).toBe(401);
    expect(authService.listSessionsForUsername).not.toHaveBeenCalled();

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejects revoke requests for a different username through requireUsernameAuthMiddleware', async () => {
    const { app, authService } = createTestApp({
      authenticatedUsername: TEST_USERNAME,
    });

    const response = await app.request(
      `/other-user/sessions/${TEST_SESSION_ID}`,
      {
        method: 'DELETE',
      },
    );

    expect(response.status).toBe(401);
    expect(authService.revokeSessionForUsername).not.toHaveBeenCalled();

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('propagates listSessionsForUsername errors through the route error handler', async () => {
    const authService = createMockAuthService();

    authService.listSessionsForUsername.mockRejectedValueOnce(
      new Error('Failed to list sessions.'),
    );

    const { app } = createTestApp({
      authService,
    });

    const response = await app.request(`/${TEST_USERNAME}/sessions`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Failed to list sessions.',
      },
    });
  });

  it('propagates revokeSessionForUsername errors through the route error handler', async () => {
    const authService = createMockAuthService();

    authService.revokeSessionForUsername.mockRejectedValueOnce(
      new Error('Failed to revoke session.'),
    );

    const { app } = createTestApp({
      authService,
    });

    const response = await app.request(
      `/${TEST_USERNAME}/sessions/${TEST_SESSION_ID}`,
      {
        method: 'DELETE',
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Failed to revoke session.',
      },
    });
  });

  it('returns 404 for unsupported session nested paths', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(`/${TEST_USERNAME}/sessions/extra/path`);

    expect(response.status).toBe(404);
    expect(authService.listSessionsForUsername).not.toHaveBeenCalled();
    expect(authService.revokeSessionForUsername).not.toHaveBeenCalled();
  });

  it('returns 404 for unsupported methods on /:username/sessions', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(`/${TEST_USERNAME}/sessions`, {
      method: 'POST',
    });

    expect(response.status).toBe(404);
    expect(authService.listSessionsForUsername).not.toHaveBeenCalled();
    expect(authService.revokeSessionForUsername).not.toHaveBeenCalled();
  });
});

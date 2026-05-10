import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import { AUTH_USER_STATUS } from '@helix-ai/contracts';

import {
  createAuthUsernameRoutes,
  authUsernameRoutes,
} from './auth-username.routes';
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
const TEST_ACCESS_TOKEN = 'test.access.token' as AuthTokenString;

type TestAppOptions = {
  authenticated?: boolean;
  authenticatedUsername?: string;
  authService?: MockAuthService;
};

type MockAuthService = {
  getAuthForUsername: ReturnType<typeof vi.fn>;
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

const createAuthIdentityResponse = (username = TEST_USERNAME) => {
  return {
    user: {
      id: TEST_USER_ID,
      username,
      email: TEST_EMAIL,
      emailVerified: true,
      status: AUTH_USER_STATUS.ACTIVE,
      createdAt: '2026-05-09T12:00:00.000Z',
      updatedAt: '2026-05-09T12:30:00.000Z',
    },
  };
};

const createMockAuthService = (): MockAuthService => {
  return {
    getAuthForUsername: vi.fn(
      async (_authenticatedUsername, requestedUsername) => {
        return createAuthIdentityResponse(requestedUsername);
      },
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
        expiresAt: new Date('2026-05-09T13:00:00.000Z'),
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
    createAuthUsernameRoutes({
      authService: authService as unknown as AuthService,
    }),
  );

  return {
    app,
    authService,
  };
};

describe('auth-username.routes', () => {
  it('exports authUsernameRoutes as an alias for createAuthUsernameRoutes', () => {
    expect(authUsernameRoutes).toBe(createAuthUsernameRoutes);
  });

  it('handles GET /:username for the authenticated username', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(`/${TEST_USERNAME}`);

    expect(response.status).toBe(200);
    expect(authService.getAuthForUsername).toHaveBeenCalledWith(
      TEST_USERNAME,
      TEST_USERNAME,
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      data: createAuthIdentityResponse(TEST_USERNAME),
    });
  });

  it('normalizes the requested username before calling AuthService', async () => {
    const { app, authService } = createTestApp({
      authenticatedUsername: TEST_USERNAME,
    });

    const response = await app.request('/SinLess777');

    expect(response.status).toBe(200);
    expect(authService.getAuthForUsername).toHaveBeenCalledWith(
      TEST_USERNAME,
      TEST_USERNAME,
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      data: createAuthIdentityResponse(TEST_USERNAME),
    });
  });

  it('returns the AuthService response inside a success response body', async () => {
    const authService = createMockAuthService();

    authService.getAuthForUsername.mockResolvedValueOnce({
      user: {
        id: TEST_USER_ID,
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        emailVerified: true,
        status: AUTH_USER_STATUS.ACTIVE,
        createdAt: '2026-05-09T12:00:00.000Z',
        updatedAt: '2026-05-09T12:30:00.000Z',
      },
      permissions: {
        canReadAuth: true,
      },
    });

    const { app } = createTestApp({
      authService,
    });

    const response = await app.request(`/${TEST_USERNAME}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        user: {
          id: TEST_USER_ID,
          username: TEST_USERNAME,
          email: TEST_EMAIL,
          emailVerified: true,
          status: AUTH_USER_STATUS.ACTIVE,
          createdAt: '2026-05-09T12:00:00.000Z',
          updatedAt: '2026-05-09T12:30:00.000Z',
        },
        permissions: {
          canReadAuth: true,
        },
      },
    });
  });

  it('rejects anonymous requests before calling AuthService', async () => {
    const { app, authService } = createTestApp({
      authenticated: false,
    });

    const response = await app.request(`/${TEST_USERNAME}`);

    expect(response.status).toBe(401);
    expect(authService.getAuthForUsername).not.toHaveBeenCalled();

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejects requests for a different username through requireUsernameAuthMiddleware', async () => {
    const { app, authService } = createTestApp({
      authenticatedUsername: TEST_USERNAME,
    });

    const response = await app.request('/other-user');

    expect(response.status).toBe(401);
    expect(authService.getAuthForUsername).not.toHaveBeenCalled();

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('propagates AuthService errors through the route error handler', async () => {
    const authService = createMockAuthService();

    authService.getAuthForUsername.mockRejectedValueOnce(
      new Error('Failed to load auth identity.'),
    );

    const { app } = createTestApp({
      authService,
    });

    const response = await app.request(`/${TEST_USERNAME}`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Failed to load auth identity.',
      },
    });
  });

  it('returns 404 for unsupported nested paths', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(`/${TEST_USERNAME}/extra`);

    expect(response.status).toBe(404);
    expect(authService.getAuthForUsername).not.toHaveBeenCalled();
  });

  it('returns 404 for unsupported methods', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(`/${TEST_USERNAME}`, {
      method: 'POST',
    });

    expect(response.status).toBe(404);
    expect(authService.getAuthForUsername).not.toHaveBeenCalled();
  });
});

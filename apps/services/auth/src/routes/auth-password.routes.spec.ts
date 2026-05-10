import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import { AUTH_USER_STATUS } from '@helix-ai/contracts';

import {
  authPasswordRoutes,
  createAuthPasswordRoutes,
} from './auth-password.routes';
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

const TEST_CURRENT_PASSWORD = 'A7x!Qm92#Vt5Nz';
const TEST_NEW_PASSWORD = 'B8y@Lp64$Wr3Kx';
const TEST_PASSWORD_RESET_TOKEN =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90' as AuthTokenString;

type TestAppOptions = {
  authenticated?: boolean;
  authenticatedUsername?: string;
  authService?: MockAuthService;
};

type MockAuthService = {
  changePassword: ReturnType<typeof vi.fn>;
  createPasswordResetToken: ReturnType<typeof vi.fn>;
  resetPassword: ReturnType<typeof vi.fn>;
};

const HTTP_HEADER = {
  CONTENT_TYPE: 'Content-Type',
} as const;

const JSON_CONTENT_TYPE = 'application/json';

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

const createPasswordChangeBody = (
  overrides: Partial<Record<string, unknown>> = {},
) => {
  return {
    currentPassword: TEST_CURRENT_PASSWORD,
    newPassword: TEST_NEW_PASSWORD,
    confirmPassword: TEST_NEW_PASSWORD,
    ...overrides,
  };
};

const createPasswordResetTokenBody = (
  overrides: Partial<Record<string, unknown>> = {},
) => {
  return {
    username: TEST_USERNAME,
    ...overrides,
  };
};

const createPasswordResetBody = (
  overrides: Partial<Record<string, unknown>> = {},
) => {
  return {
    token: TEST_PASSWORD_RESET_TOKEN,
    newPassword: TEST_NEW_PASSWORD,
    confirmPassword: TEST_NEW_PASSWORD,
    ...overrides,
  };
};

const createPasswordChangeResponse = () => {
  return {
    changed: true,
    changedAt: '2026-05-09T13:00:00.000Z',
  };
};

const createPasswordResetTokenResponse = () => {
  return {
    created: true,
    type: 'password_reset',
    token: TEST_PASSWORD_RESET_TOKEN,
    expiresAt: '2026-05-09T14:00:00.000Z',
  };
};

const createPasswordResetResponse = () => {
  return {
    reset: true,
    resetAt: '2026-05-09T13:30:00.000Z',
  };
};

const createMockAuthService = (): MockAuthService => {
  return {
    changePassword: vi.fn(async () => createPasswordChangeResponse()),

    createPasswordResetToken: vi.fn(async () => {
      return {
        response: createPasswordResetTokenResponse(),
        token: TEST_PASSWORD_RESET_TOKEN,
        tokenHash: 'hashed-password-reset-token',
        claims: {
          id: 'password_reset_jti_123',
          userId: TEST_USER_ID,
          username: TEST_USERNAME,
          type: AUTH_TOKEN_TYPE.PASSWORD_RESET,
          scopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE],
          issuer: 'helix-auth-test',
          audience: 'helix-api-test',
          issuedAt: 1_777_980_000,
          expiresAt: 1_777_983_600,
        },
      };
    }),

    resetPassword: vi.fn(async () => createPasswordResetResponse()),
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
    createAuthPasswordRoutes({
      authService: authService as unknown as AuthService,
    }),
  );

  return {
    app,
    authService,
  };
};

const jsonRequest = (method: 'POST' | 'PATCH', body: unknown): RequestInit => {
  return {
    method,
    headers: {
      [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(body),
  };
};

describe('auth-password.routes', () => {
  it('exports authPasswordRoutes as an alias for createAuthPasswordRoutes', () => {
    expect(authPasswordRoutes).toBe(createAuthPasswordRoutes);
  });

  describe('PATCH /:username/password', () => {
    it('changes password for the authenticated username', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        `/${TEST_USERNAME}/password`,
        jsonRequest('PATCH', createPasswordChangeBody()),
      );

      expect(response.status).toBe(200);
      expect(authService.changePassword).toHaveBeenCalledWith(
        TEST_USERNAME,
        TEST_USERNAME,
        expect.objectContaining({
          currentPassword: TEST_CURRENT_PASSWORD,
          newPassword: TEST_NEW_PASSWORD,
          confirmPassword: TEST_NEW_PASSWORD,
        }),
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createPasswordChangeResponse(),
      });
    });

    it('passes the raw requested username into AuthService after auth middleware authorizes it', async () => {
      const { app, authService } = createTestApp({
        authenticatedUsername: TEST_USERNAME,
      });

      const response = await app.request(
        '/SinLess777/password',
        jsonRequest('PATCH', createPasswordChangeBody()),
      );

      expect(response.status).toBe(200);
      expect(authService.changePassword).toHaveBeenCalledWith(
        TEST_USERNAME,
        'SinLess777',
        expect.objectContaining({
          currentPassword: TEST_CURRENT_PASSWORD,
          newPassword: TEST_NEW_PASSWORD,
          confirmPassword: TEST_NEW_PASSWORD,
        }),
      );
    });

    it('rejects anonymous password change requests before calling AuthService', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request(
        `/${TEST_USERNAME}/password`,
        jsonRequest('PATCH', createPasswordChangeBody()),
      );

      expect(response.status).toBe(401);
      expect(authService.changePassword).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: expect.any(String),
        },
      });
    });

    it('rejects password change requests for a different username through requireUsernameAuthMiddleware', async () => {
      const { app, authService } = createTestApp({
        authenticatedUsername: TEST_USERNAME,
      });

      const response = await app.request(
        '/other-user/password',
        jsonRequest('PATCH', createPasswordChangeBody()),
      );

      expect(response.status).toBe(401);
      expect(authService.changePassword).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: expect.any(String),
        },
      });
    });

    it('returns INVALID_JSON when the change-password body is malformed JSON', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(`/${TEST_USERNAME}/password`, {
        method: 'PATCH',
        headers: {
          [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
        },
        body: '{invalid-json',
      });

      expect(response.status).toBe(400);
      expect(authService.changePassword).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
    });

    it('returns VALIDATION_ERROR when the change-password body is invalid', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        `/${TEST_USERNAME}/password`,
        jsonRequest('PATCH', {
          currentPassword: '',
          newPassword: 'weak',
          confirmPassword: 'different',
        }),
      );

      expect(response.status).toBe(400);
      expect(authService.changePassword).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password change request is invalid.',
          details: {
            issues: expect.any(Array),
          },
        },
      });
    });

    it('propagates changePassword errors through the route error handler', async () => {
      const authService = createMockAuthService();

      authService.changePassword.mockRejectedValueOnce(
        new Error('Password change failed.'),
      );

      const { app } = createTestApp({
        authService,
      });

      const response = await app.request(
        `/${TEST_USERNAME}/password`,
        jsonRequest('PATCH', createPasswordChangeBody()),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: 'Password change failed.',
        },
      });
    });
  });

  describe('POST /password/reset-token', () => {
    it('creates a password reset token by username and returns only the response payload', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request(
        '/password/reset-token',
        jsonRequest('POST', createPasswordResetTokenBody()),
      );

      expect(response.status).toBe(200);
      expect(authService.createPasswordResetToken).toHaveBeenCalledWith(
        expect.objectContaining({
          username: TEST_USERNAME,
        }),
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createPasswordResetTokenResponse(),
      });
    });

    it('creates a password reset token by email', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request(
        '/password/reset-token',
        jsonRequest(
          'POST',
          createPasswordResetTokenBody({
            username: undefined,
            email: TEST_EMAIL,
          }),
        ),
      );

      expect(response.status).toBe(200);
      expect(authService.createPasswordResetToken).toHaveBeenCalledWith(
        expect.objectContaining({
          email: TEST_EMAIL,
        }),
      );
    });

    it('returns INVALID_JSON when the reset-token body is malformed JSON', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request('/password/reset-token', {
        method: 'POST',
        headers: {
          [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
        },
        body: '{invalid-json',
      });

      expect(response.status).toBe(400);
      expect(authService.createPasswordResetToken).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
    });

    it('returns VALIDATION_ERROR when the reset-token body is invalid', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request(
        '/password/reset-token',
        jsonRequest('POST', {
          username: '',
          email: 'not-an-email',
        }),
      );

      expect(response.status).toBe(400);
      expect(authService.createPasswordResetToken).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password reset token request is invalid.',
          details: {
            issues: expect.any(Array),
          },
        },
      });
    });

    it('propagates createPasswordResetToken errors through the route error handler', async () => {
      const authService = createMockAuthService();

      authService.createPasswordResetToken.mockRejectedValueOnce(
        new Error('Password reset token failed.'),
      );

      const { app } = createTestApp({
        authenticated: false,
        authService,
      });

      const response = await app.request(
        '/password/reset-token',
        jsonRequest('POST', createPasswordResetTokenBody()),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: 'Password reset token failed.',
        },
      });
    });
  });

  describe('POST /password/reset', () => {
    it('resets a password and returns 200', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request(
        '/password/reset',
        jsonRequest('POST', createPasswordResetBody()),
      );

      expect(response.status).toBe(200);
      expect(authService.resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          token: TEST_PASSWORD_RESET_TOKEN,
          newPassword: TEST_NEW_PASSWORD,
          confirmPassword: TEST_NEW_PASSWORD,
        }),
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createPasswordResetResponse(),
      });
    });

    it('returns INVALID_JSON when the reset body is malformed JSON', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request('/password/reset', {
        method: 'POST',
        headers: {
          [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
        },
        body: '{invalid-json',
      });

      expect(response.status).toBe(400);
      expect(authService.resetPassword).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
    });

    it('returns VALIDATION_ERROR when the reset body is invalid', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request(
        '/password/reset',
        jsonRequest('POST', {
          token: '',
          newPassword: 'weak',
          confirmPassword: 'different',
        }),
      );

      expect(response.status).toBe(400);
      expect(authService.resetPassword).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password reset request is invalid.',
          details: {
            issues: expect.any(Array),
          },
        },
      });
    });

    it('propagates resetPassword errors through the route error handler', async () => {
      const authService = createMockAuthService();

      authService.resetPassword.mockRejectedValueOnce(
        new Error('Password reset failed.'),
      );

      const { app } = createTestApp({
        authenticated: false,
        authService,
      });

      const response = await app.request(
        '/password/reset',
        jsonRequest('POST', createPasswordResetBody()),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: 'Password reset failed.',
        },
      });
    });
  });

  it('returns 404 for unknown password routes', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request('/password/missing-route');

    expect(response.status).toBe(404);
    expect(authService.changePassword).not.toHaveBeenCalled();
    expect(authService.createPasswordResetToken).not.toHaveBeenCalled();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('returns 404 for unsupported methods', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request('/password/reset', {
      method: 'GET',
    });

    expect(response.status).toBe(404);
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });
});

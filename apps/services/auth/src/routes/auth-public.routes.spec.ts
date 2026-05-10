import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import { authPublicRoutes, createAuthPublicRoutes } from './auth-public.routes';
import type { AuthService } from '../services/auth.service';
import type { AuthHonoEnv } from '../types/auth-context.type';
import type { AuthTokenString } from '../types/auth-token.type';

const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_PASSWORD = 'ValidPass1!';
const TEST_DISPLAY_NAME = 'Sinless777';
const TEST_SESSION_ID = 'session_123';
const TEST_ACCESS_TOKEN = 'test.access.token' as AuthTokenString;
const TEST_REFRESH_TOKEN = 'test.refresh.token' as AuthTokenString;

type MockAuthService = {
  register: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
};

const HTTP_HEADER = {
  CONTENT_TYPE: 'Content-Type',
  USER_AGENT: 'User-Agent',
  CF_CONNECTING_IP: 'CF-Connecting-IP',
  X_FORWARDED_FOR: 'X-Forwarded-For',
  X_REAL_IP: 'X-Real-IP',
} as const;

const JSON_CONTENT_TYPE = 'application/json';

const createRegisterBody = (
  overrides: Partial<Record<string, unknown>> = {},
) => {
  return {
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    displayName: TEST_DISPLAY_NAME,
    timezone: 'America/Boise',
    locale: 'en-US',
    ...overrides,
  };
};

const createLoginBody = (overrides: Partial<Record<string, unknown>> = {}) => {
  return {
    identifier: TEST_USERNAME,
    password: TEST_PASSWORD,
    ...overrides,
  };
};

const createRefreshBody = (
  overrides: Partial<Record<string, unknown>> = {},
) => {
  return {
    refreshToken: TEST_REFRESH_TOKEN,
    sessionId: TEST_SESSION_ID,
    rotate: true,
    ...overrides,
  };
};

const createLogoutBody = (overrides: Partial<Record<string, unknown>> = {}) => {
  return {
    refreshToken: TEST_REFRESH_TOKEN,
    sessionId: TEST_SESSION_ID,
    allSessions: false,
    ...overrides,
  };
};

const createRegisterResponse = () => {
  return {
    user: {
      id: 'user_123',
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      emailVerified: false,
      status: 'pending_verification',
      createdAt: '2026-05-09T12:00:00.000Z',
      updatedAt: '2026-05-09T12:00:00.000Z',
    },
    session: {
      id: TEST_SESSION_ID,
      userId: 'user_123',
      expiresAt: '2026-06-08T12:00:00.000Z',
    },
    tokens: {
      accessToken: TEST_ACCESS_TOKEN,
      refreshToken: TEST_REFRESH_TOKEN,
      tokenType: 'Bearer',
      accessTokenExpiresAt: '2026-05-09T12:15:00.000Z',
      refreshTokenExpiresAt: '2026-06-08T12:00:00.000Z',
    },
  };
};

const createLoginResponse = () => {
  return {
    user: {
      id: 'user_123',
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      emailVerified: true,
      status: 'active',
      createdAt: '2026-05-09T12:00:00.000Z',
      updatedAt: '2026-05-09T12:30:00.000Z',
    },
    session: {
      id: TEST_SESSION_ID,
      userId: 'user_123',
      expiresAt: '2026-06-08T12:00:00.000Z',
    },
    tokens: {
      accessToken: TEST_ACCESS_TOKEN,
      refreshToken: TEST_REFRESH_TOKEN,
      tokenType: 'Bearer',
      accessTokenExpiresAt: '2026-05-09T12:15:00.000Z',
      refreshTokenExpiresAt: '2026-06-08T12:00:00.000Z',
    },
  };
};

const createRefreshResponse = () => {
  return {
    session: {
      id: TEST_SESSION_ID,
      userId: 'user_123',
      expiresAt: '2026-06-08T12:00:00.000Z',
    },
    tokens: {
      accessToken: TEST_ACCESS_TOKEN,
      refreshToken: TEST_REFRESH_TOKEN,
      tokenType: 'Bearer',
      accessTokenExpiresAt: '2026-05-09T12:15:00.000Z',
      refreshTokenExpiresAt: '2026-06-08T12:00:00.000Z',
    },
  };
};

const createLogoutResponse = () => {
  return {
    revoked: true,
    sessionId: TEST_SESSION_ID,
    revokedAt: '2026-05-09T13:00:00.000Z',
  };
};

const createMockAuthService = (): MockAuthService => {
  return {
    register: vi.fn(async () => createRegisterResponse()),
    login: vi.fn(async () => createLoginResponse()),
    refresh: vi.fn(async () => createRefreshResponse()),
    logout: vi.fn(async () => createLogoutResponse()),
  };
};

const createTestApp = (
  authService: MockAuthService = createMockAuthService(),
) => {
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

  app.route(
    '/',
    createAuthPublicRoutes({
      authService: authService as unknown as AuthService,
    }),
  );

  return {
    app,
    authService,
  };
};

const jsonRequest = (
  method: 'POST',
  body: unknown,
  headers: Record<string, string> = {},
): RequestInit => {
  return {
    method,
    headers: {
      [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
      ...headers,
    },
    body: JSON.stringify(body),
  };
};

describe('auth-public.routes', () => {
  it('exports authPublicRoutes as an alias for createAuthPublicRoutes', () => {
    expect(authPublicRoutes).toBe(createAuthPublicRoutes);
  });

  describe('POST /register', () => {
    it('registers a user and returns 201', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/register',
        jsonRequest('POST', createRegisterBody(), {
          [HTTP_HEADER.USER_AGENT]: 'Vitest Browser',
          [HTTP_HEADER.CF_CONNECTING_IP]: '203.0.113.10',
        }),
      );

      expect(response.status).toBe(201);
      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          username: TEST_USERNAME,
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          displayName: TEST_DISPLAY_NAME,
        }),
        {
          userAgent: 'Vitest Browser',
          ipAddress: '203.0.113.10',
        },
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createRegisterResponse(),
      });
    });

    it('uses X-Forwarded-For when CF-Connecting-IP is missing', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/register',
        jsonRequest('POST', createRegisterBody(), {
          [HTTP_HEADER.X_FORWARDED_FOR]: '198.51.100.10, 198.51.100.11',
        }),
      );

      expect(response.status).toBe(201);
      expect(authService.register).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          ipAddress: '198.51.100.10',
        }),
      );
    });

    it('uses X-Real-IP when other forwarded IP headers are missing', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/register',
        jsonRequest('POST', createRegisterBody(), {
          [HTTP_HEADER.X_REAL_IP]: '192.0.2.10',
        }),
      );

      expect(response.status).toBe(201);
      expect(authService.register).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          ipAddress: '192.0.2.10',
        }),
      );
    });

    it('returns INVALID_JSON when the body is malformed JSON', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request('/register', {
        method: 'POST',
        headers: {
          [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
        },
        body: '{invalid-json',
      });

      expect(response.status).toBe(400);
      expect(authService.register).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
    });

    it('returns VALIDATION_ERROR when the register body is invalid', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/register',
        jsonRequest('POST', {
          username: '',
          email: 'not-an-email',
          password: 'weak',
        }),
      );

      expect(response.status).toBe(400);
      expect(authService.register).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Registration request is invalid.',
          details: {
            issues: expect.any(Array),
          },
        },
      });
    });

    it('propagates AuthService register errors through the app error handler', async () => {
      const authService = createMockAuthService();

      authService.register.mockRejectedValueOnce(
        new Error('Registration failed.'),
      );

      const { app } = createTestApp(authService);

      const response = await app.request(
        '/register',
        jsonRequest('POST', createRegisterBody()),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: 'Registration failed.',
        },
      });
    });
  });

  describe('POST /login', () => {
    it('logs in and returns 200', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/login',
        jsonRequest('POST', createLoginBody(), {
          [HTTP_HEADER.USER_AGENT]: 'Vitest Browser',
          [HTTP_HEADER.CF_CONNECTING_IP]: '203.0.113.20',
        }),
      );

      expect(response.status).toBe(200);
      expect(authService.login).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: TEST_USERNAME,
          password: TEST_PASSWORD,
        }),
        {
          userAgent: 'Vitest Browser',
          ipAddress: '203.0.113.20',
        },
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createLoginResponse(),
      });
    });

    it('returns INVALID_JSON when the login body is malformed JSON', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request('/login', {
        method: 'POST',
        headers: {
          [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
        },
        body: '{invalid-json',
      });

      expect(response.status).toBe(400);
      expect(authService.login).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
    });

    it('returns VALIDATION_ERROR when the login body is invalid', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/login',
        jsonRequest('POST', {
          identifier: '',
          password: '',
        }),
      );

      expect(response.status).toBe(400);
      expect(authService.login).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Login request is invalid.',
          details: {
            issues: expect.any(Array),
          },
        },
      });
    });

    it('propagates AuthService login errors through the app error handler', async () => {
      const authService = createMockAuthService();

      authService.login.mockRejectedValueOnce(new Error('Login failed.'));

      const { app } = createTestApp(authService);

      const response = await app.request(
        '/login',
        jsonRequest('POST', createLoginBody()),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: 'Login failed.',
        },
      });
    });
  });

  describe('POST /refresh', () => {
    it('refreshes a session and returns 200', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/refresh',
        jsonRequest('POST', createRefreshBody(), {
          [HTTP_HEADER.USER_AGENT]: 'Vitest Browser',
          [HTTP_HEADER.CF_CONNECTING_IP]: '203.0.113.30',
        }),
      );

      expect(response.status).toBe(200);
      expect(authService.refresh).toHaveBeenCalledWith(
        expect.objectContaining({
          refreshToken: TEST_REFRESH_TOKEN,
          sessionId: TEST_SESSION_ID,
          rotate: true,
        }),
        {
          userAgent: 'Vitest Browser',
          ipAddress: '203.0.113.30',
        },
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createRefreshResponse(),
      });
    });

    it('returns INVALID_JSON when the refresh body is malformed JSON', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request('/refresh', {
        method: 'POST',
        headers: {
          [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
        },
        body: '{invalid-json',
      });

      expect(response.status).toBe(400);
      expect(authService.refresh).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
    });

    it('returns VALIDATION_ERROR when the refresh body is invalid', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/refresh',
        jsonRequest('POST', {
          refreshToken: '',
          rotate: 'not-a-boolean',
        }),
      );

      expect(response.status).toBe(400);
      expect(authService.refresh).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Refresh request is invalid.',
          details: {
            issues: expect.any(Array),
          },
        },
      });
    });

    it('propagates AuthService refresh errors through the app error handler', async () => {
      const authService = createMockAuthService();

      authService.refresh.mockRejectedValueOnce(new Error('Refresh failed.'));

      const { app } = createTestApp(authService);

      const response = await app.request(
        '/refresh',
        jsonRequest('POST', createRefreshBody()),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: 'Refresh failed.',
        },
      });
    });
  });

  describe('POST /logout', () => {
    it('logs out and returns 200', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/logout',
        jsonRequest('POST', createLogoutBody()),
      );

      expect(response.status).toBe(200);
      expect(authService.logout).toHaveBeenCalledWith(
        expect.objectContaining({
          refreshToken: TEST_REFRESH_TOKEN,
          sessionId: TEST_SESSION_ID,
          allSessions: false,
        }),
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createLogoutResponse(),
      });
    });

    it('returns INVALID_JSON when the logout body is malformed JSON', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request('/logout', {
        method: 'POST',
        headers: {
          [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
        },
        body: '{invalid-json',
      });

      expect(response.status).toBe(400);
      expect(authService.logout).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
    });

    it('returns VALIDATION_ERROR when the logout body is invalid', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        '/logout',
        jsonRequest('POST', {
          refreshToken: '',
          allSessions: 'not-a-boolean',
        }),
      );

      expect(response.status).toBe(400);
      expect(authService.logout).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Logout request is invalid.',
          details: {
            issues: expect.any(Array),
          },
        },
      });
    });

    it('propagates AuthService logout errors through the app error handler', async () => {
      const authService = createMockAuthService();

      authService.logout.mockRejectedValueOnce(new Error('Logout failed.'));

      const { app } = createTestApp(authService);

      const response = await app.request(
        '/logout',
        jsonRequest('POST', createLogoutBody()),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: 'Logout failed.',
        },
      });
    });
  });

  it('returns 404 for unknown public auth routes', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request('/missing-route');

    expect(response.status).toBe(404);
    expect(authService.register).not.toHaveBeenCalled();
    expect(authService.login).not.toHaveBeenCalled();
    expect(authService.refresh).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('returns 404 for unsupported methods', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request('/login', {
      method: 'GET',
    });

    expect(response.status).toBe(404);
    expect(authService.login).not.toHaveBeenCalled();
  });
});

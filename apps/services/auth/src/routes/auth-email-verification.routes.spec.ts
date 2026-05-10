import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import { AUTH_USER_STATUS } from '@helix-ai/contracts';

import {
  authEmailVerificationRoutes,
  createAuthEmailVerificationRoutes,
} from './auth-email-verification.routes';
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
const TEST_EMAIL_VERIFICATION_TOKEN =
  'email-verification-token-test-value-00000000000000000000000000000000' as AuthTokenString;

type TestAppOptions = {
  authenticated?: boolean;
  authenticatedUsername?: string;
  authService?: MockAuthService;
};

type MockAuthService = {
  createEmailVerificationToken: ReturnType<typeof vi.fn>;
  verifyEmail: ReturnType<typeof vi.fn>;
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

const createEmailVerificationTokenBody = (
  overrides: Partial<Record<string, unknown>> = {},
) => {
  return {
    email: TEST_EMAIL,
    ...overrides,
  };
};

const createVerifyEmailBody = (
  overrides: Partial<Record<string, unknown>> = {},
) => {
  return {
    token: TEST_EMAIL_VERIFICATION_TOKEN,
    ...overrides,
  };
};

const createEmailVerificationTokenResponse = () => {
  return {
    created: true,
    type: 'email_verification',
    token: TEST_EMAIL_VERIFICATION_TOKEN,
    expiresAt: '2026-05-10T12:00:00.000Z',
  };
};

const createVerifyEmailResponse = () => {
  return {
    verified: true,
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    verifiedAt: '2026-05-09T13:00:00.000Z',
  };
};

const createMockAuthService = (): MockAuthService => {
  return {
    createEmailVerificationToken: vi.fn(async () => {
      return {
        response: createEmailVerificationTokenResponse(),
        token: TEST_EMAIL_VERIFICATION_TOKEN,
        tokenHash: 'hashed-email-verification-token',
        claims: {
          id: 'email_verification_jti_123',
          userId: TEST_USER_ID,
          username: TEST_USERNAME,
          type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
          scopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE],
          issuer: 'helix-auth-test',
          audience: 'helix-api-test',
          issuedAt: 1_777_980_000,
          expiresAt: 1_778_066_400,
        },
      };
    }),

    verifyEmail: vi.fn(async () => createVerifyEmailResponse()),
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
        emailVerified: false,
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
    createAuthEmailVerificationRoutes({
      authService: authService as unknown as AuthService,
    }),
  );

  return {
    app,
    authService,
  };
};

const jsonRequest = (method: 'POST', body: unknown): RequestInit => {
  return {
    method,
    headers: {
      [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(body),
  };
};

describe('auth-email-verification.routes', () => {
  it('exports authEmailVerificationRoutes as an alias for createAuthEmailVerificationRoutes', () => {
    expect(authEmailVerificationRoutes).toBe(createAuthEmailVerificationRoutes);
  });

  describe('POST /:username/email/verification-token', () => {
    it('creates an email verification token for the authenticated username', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        `/${TEST_USERNAME}/email/verification-token`,
        jsonRequest('POST', createEmailVerificationTokenBody()),
      );

      expect(response.status).toBe(200);
      expect(authService.createEmailVerificationToken).toHaveBeenCalledWith(
        TEST_USERNAME,
        TEST_USERNAME,
        expect.objectContaining({
          email: TEST_EMAIL,
        }),
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createEmailVerificationTokenResponse(),
      });
    });

    it('allows an omitted JSON body for creating an email verification token', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        `/${TEST_USERNAME}/email/verification-token`,
        {
          method: 'POST',
        },
      );

      expect(response.status).toBe(200);
      expect(authService.createEmailVerificationToken).toHaveBeenCalledWith(
        TEST_USERNAME,
        TEST_USERNAME,
        expect.any(Object),
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createEmailVerificationTokenResponse(),
      });
    });

    it('normalizes the requested username before creating an email verification token', async () => {
      const { app, authService } = createTestApp({
        authenticatedUsername: TEST_USERNAME,
      });

      const response = await app.request(
        '/SinLess777/email/verification-token',
        jsonRequest('POST', createEmailVerificationTokenBody()),
      );

      expect(response.status).toBe(200);
      expect(authService.createEmailVerificationToken).toHaveBeenCalledWith(
        TEST_USERNAME,
        TEST_USERNAME,
        expect.objectContaining({
          email: TEST_EMAIL,
        }),
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createEmailVerificationTokenResponse(),
      });
    });

    it('rejects anonymous create-token requests before calling AuthService', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request(
        `/${TEST_USERNAME}/email/verification-token`,
        jsonRequest('POST', createEmailVerificationTokenBody()),
      );

      expect(response.status).toBe(401);
      expect(authService.createEmailVerificationToken).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: expect.any(String),
        },
      });
    });

    it('rejects create-token requests for a different username through requireUsernameAuthMiddleware', async () => {
      const { app, authService } = createTestApp({
        authenticatedUsername: TEST_USERNAME,
      });

      const response = await app.request(
        '/other-user/email/verification-token',
        jsonRequest('POST', createEmailVerificationTokenBody()),
      );

      expect(response.status).toBe(401);
      expect(authService.createEmailVerificationToken).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: expect.any(String),
        },
      });
    });

    it('returns INVALID_JSON when the create-token body is malformed JSON', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        `/${TEST_USERNAME}/email/verification-token`,
        {
          method: 'POST',
          headers: {
            [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
          },
          body: '{invalid-json',
        },
      );

      expect(response.status).toBe(400);
      expect(authService.createEmailVerificationToken).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
    });

    it('returns VALIDATION_ERROR when the create-token body is invalid', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        `/${TEST_USERNAME}/email/verification-token`,
        jsonRequest('POST', {
          email: 'not-an-email',
        }),
      );

      expect(response.status).toBe(400);
      expect(authService.createEmailVerificationToken).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email verification token request is invalid.',
          details: {
            issues: expect.any(Array),
          },
        },
      });
    });

    it('propagates createEmailVerificationToken errors through the route error handler', async () => {
      const authService = createMockAuthService();

      authService.createEmailVerificationToken.mockRejectedValueOnce(
        new Error('Email verification token creation failed.'),
      );

      const { app } = createTestApp({
        authService,
      });

      const response = await app.request(
        `/${TEST_USERNAME}/email/verification-token`,
        jsonRequest('POST', createEmailVerificationTokenBody()),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: 'Email verification token creation failed.',
        },
      });
    });
  });

  describe('POST /:username/email/verify', () => {
    it('verifies email for the authenticated username', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        `/${TEST_USERNAME}/email/verify`,
        jsonRequest('POST', createVerifyEmailBody()),
      );

      expect(response.status).toBe(200);
      expect(authService.verifyEmail).toHaveBeenCalledWith(
        TEST_USERNAME,
        TEST_USERNAME,
        expect.objectContaining({
          token: TEST_EMAIL_VERIFICATION_TOKEN,
        }),
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createVerifyEmailResponse(),
      });
    });

    it('normalizes the requested username before verifying email', async () => {
      const { app, authService } = createTestApp({
        authenticatedUsername: TEST_USERNAME,
      });

      const response = await app.request(
        '/SinLess777/email/verify',
        jsonRequest('POST', createVerifyEmailBody()),
      );

      expect(response.status).toBe(200);
      expect(authService.verifyEmail).toHaveBeenCalledWith(
        TEST_USERNAME,
        TEST_USERNAME,
        expect.objectContaining({
          token: TEST_EMAIL_VERIFICATION_TOKEN,
        }),
      );

      await expect(response.json()).resolves.toEqual({
        success: true,
        data: createVerifyEmailResponse(),
      });
    });

    it('rejects anonymous verify-email requests before calling AuthService', async () => {
      const { app, authService } = createTestApp({
        authenticated: false,
      });

      const response = await app.request(
        `/${TEST_USERNAME}/email/verify`,
        jsonRequest('POST', createVerifyEmailBody()),
      );

      expect(response.status).toBe(401);
      expect(authService.verifyEmail).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: expect.any(String),
        },
      });
    });

    it('rejects verify-email requests for a different username through requireUsernameAuthMiddleware', async () => {
      const { app, authService } = createTestApp({
        authenticatedUsername: TEST_USERNAME,
      });

      const response = await app.request(
        '/other-user/email/verify',
        jsonRequest('POST', createVerifyEmailBody()),
      );

      expect(response.status).toBe(401);
      expect(authService.verifyEmail).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: expect.any(String),
        },
      });
    });

    it('returns INVALID_JSON when the verify-email body is malformed JSON', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(`/${TEST_USERNAME}/email/verify`, {
        method: 'POST',
        headers: {
          [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE,
        },
        body: '{invalid-json',
      });

      expect(response.status).toBe(400);
      expect(authService.verifyEmail).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
    });

    it('returns VALIDATION_ERROR when the verify-email body is invalid', async () => {
      const { app, authService } = createTestApp();

      const response = await app.request(
        `/${TEST_USERNAME}/email/verify`,
        jsonRequest('POST', {
          token: '',
        }),
      );

      expect(response.status).toBe(400);
      expect(authService.verifyEmail).not.toHaveBeenCalled();

      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email verification request is invalid.',
          details: {
            issues: expect.any(Array),
          },
        },
      });
    });

    it('propagates verifyEmail errors through the route error handler', async () => {
      const authService = createMockAuthService();

      authService.verifyEmail.mockRejectedValueOnce(
        new Error('Email verification failed.'),
      );

      const { app } = createTestApp({
        authService,
      });

      const response = await app.request(
        `/${TEST_USERNAME}/email/verify`,
        jsonRequest('POST', createVerifyEmailBody()),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          message: 'Email verification failed.',
        },
      });
    });
  });

  it('returns 404 for unknown email verification routes', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(`/${TEST_USERNAME}/email/missing-route`);

    expect(response.status).toBe(404);
    expect(authService.createEmailVerificationToken).not.toHaveBeenCalled();
    expect(authService.verifyEmail).not.toHaveBeenCalled();
  });

  it('returns 404 for unsupported methods', async () => {
    const { app, authService } = createTestApp();

    const response = await app.request(`/${TEST_USERNAME}/email/verify`, {
      method: 'GET',
    });

    expect(response.status).toBe(404);
    expect(authService.verifyEmail).not.toHaveBeenCalled();
  });
});

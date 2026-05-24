import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import { AUTH_USER_STATUS } from '@aerealith-ai/contracts';

import {
  requireAnyScopeMiddleware,
  requireAuthMiddleware,
  requireScopesMiddleware,
  requireUsernameAuthMiddleware,
} from './require-auth.middleware';
import {
  createAuthenticatedAuthContext,
  setAnonymousAuthContext,
  setAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
  type AuthenticatedAuthContext,
} from '../types/auth-context.type';
import {
  AUTH_TOKEN_SCOPE,
  AUTH_TOKEN_TYPE,
  type AuthAccessTokenClaims,
  type AuthTokenScope,
  type AuthTokenString,
} from '../types/auth-token.type';

const TEST_USER_ID = 'user_123';
const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_SESSION_ID = 'session_123';
const TEST_ACCESS_TOKEN = 'test.access.token' as AuthTokenString;

type TestAppOptions = {
  authenticated?: boolean;
  scopes?: AuthTokenScope[];
  username?: string;
};

const createAccessClaims = (
  scopes: AuthTokenScope[] = [
    AUTH_TOKEN_SCOPE.AUTH_READ,
    AUTH_TOKEN_SCOPE.USER_READ,
    AUTH_TOKEN_SCOPE.SESSION_READ,
  ],
): AuthAccessTokenClaims => {
  return {
    id: 'access_jti_123',
    userId: TEST_USER_ID,
    username: TEST_USERNAME,
    sessionId: TEST_SESSION_ID,
    type: AUTH_TOKEN_TYPE.ACCESS,
    scopes,
    issuer: 'helix-auth-test',
    audience: 'helix-api-test',
    issuedAt: 1_777_980_000,
    expiresAt: 1_777_980_900,
  };
};

const createTestAuthContext = ({
  scopes,
  username = TEST_USERNAME,
}: {
  scopes?: AuthTokenScope[];
  username?: string;
} = {}): AuthenticatedAuthContext => {
  const claims = createAccessClaims(scopes);

  return createAuthenticatedAuthContext({
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

const createTestApp = ({
  authenticated = true,
  scopes,
  username = TEST_USERNAME,
}: TestAppOptions = {}): Hono<AuthHonoEnv> => {
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

    setAuthenticatedAuthContext(
      context,
      createTestAuthContext({
        scopes,
        username,
      }),
    );

    return next();
  });

  return app;
};

describe('requireAuthMiddleware', () => {
  it('allows an authenticated request with no extra options', async () => {
    const app = createTestApp();

    app.get('/protected', requireAuthMiddleware(), (c) => {
      return c.json({
        success: true,
        data: {
          ok: true,
        },
      });
    });

    const response = await app.request('/protected');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        ok: true,
      },
    });
  });

  it('rejects an anonymous request', async () => {
    const app = createTestApp({
      authenticated: false,
    });

    app.get('/protected', requireAuthMiddleware(), (c) => {
      return c.json({
        success: true,
      });
    });

    const response = await app.request('/protected');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it('allows a request when every required scope is present', async () => {
    const app = createTestApp({
      scopes: [AUTH_TOKEN_SCOPE.AUTH_READ, AUTH_TOKEN_SCOPE.USER_READ],
    });

    app.get(
      '/protected',
      requireAuthMiddleware({
        requiredScopes: [
          AUTH_TOKEN_SCOPE.AUTH_READ,
          AUTH_TOKEN_SCOPE.USER_READ,
        ],
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/protected');

    expect(response.status).toBe(200);
  });

  it('rejects a request when every required scope is not present', async () => {
    const app = createTestApp({
      scopes: [AUTH_TOKEN_SCOPE.USER_READ],
    });

    app.get(
      '/protected',
      requireAuthMiddleware({
        requiredScopes: [
          AUTH_TOKEN_SCOPE.USER_READ,
          AUTH_TOKEN_SCOPE.AUTH_WRITE,
        ],
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/protected');

    expect(response.status).toBe(401);
  });

  it('allows a request when requireEveryScope is false and one required scope is present', async () => {
    const app = createTestApp({
      scopes: [AUTH_TOKEN_SCOPE.USER_READ],
    });

    app.get(
      '/protected',
      requireAuthMiddleware({
        requiredScopes: [
          AUTH_TOKEN_SCOPE.USER_READ,
          AUTH_TOKEN_SCOPE.AUTH_WRITE,
        ],
        requireEveryScope: false,
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/protected');

    expect(response.status).toBe(200);
  });

  it('rejects a request when requireEveryScope is false and no required scopes are present', async () => {
    const app = createTestApp({
      scopes: [AUTH_TOKEN_SCOPE.USER_READ],
    });

    app.get(
      '/protected',
      requireAuthMiddleware({
        requiredScopes: [
          AUTH_TOKEN_SCOPE.AUTH_WRITE,
          AUTH_TOKEN_SCOPE.SESSION_WRITE,
        ],
        requireEveryScope: false,
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/protected');

    expect(response.status).toBe(401);
  });

  it('allows access when the username route param matches the authenticated username', async () => {
    const app = createTestApp({
      username: TEST_USERNAME,
    });

    app.get(
      '/auth/:username',
      requireAuthMiddleware({
        enforceUsernameParam: true,
      }),
      (c) => {
        return c.json({
          success: true,
          data: {
            username: c.req.param('username'),
          },
        });
      },
    );

    const response = await app.request(`/auth/${TEST_USERNAME}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        username: TEST_USERNAME,
      },
    });
  });

  it('normalizes username route params before comparing access', async () => {
    const app = createTestApp({
      username: TEST_USERNAME,
    });

    app.get(
      '/auth/:username',
      requireAuthMiddleware({
        enforceUsernameParam: true,
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/auth/SinLess777');

    expect(response.status).toBe(200);
  });

  it('rejects access when the username route param does not match and the user is not admin', async () => {
    const app = createTestApp({
      username: TEST_USERNAME,
    });

    app.get(
      '/auth/:username',
      requireAuthMiddleware({
        enforceUsernameParam: true,
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/auth/other-user');

    expect(response.status).toBe(401);
  });

  it('allows username param access when isAdmin returns true', async () => {
    const app = createTestApp({
      username: TEST_USERNAME,
    });
    const isAdmin = vi.fn(async () => true);

    app.get(
      '/auth/:username',
      requireAuthMiddleware({
        enforceUsernameParam: true,
        isAdmin,
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/auth/other-user');

    expect(response.status).toBe(200);
    expect(isAdmin).toHaveBeenCalledOnce();
  });

  it('rejects username param access when isAdmin returns false', async () => {
    const app = createTestApp({
      username: TEST_USERNAME,
    });
    const isAdmin = vi.fn(async () => false);

    app.get(
      '/auth/:username',
      requireAuthMiddleware({
        enforceUsernameParam: true,
        isAdmin,
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/auth/other-user');

    expect(response.status).toBe(401);
    expect(isAdmin).toHaveBeenCalledOnce();
  });

  it('supports a custom username param name', async () => {
    const app = createTestApp({
      username: TEST_USERNAME,
    });

    app.get(
      '/users/:handle',
      requireAuthMiddleware({
        enforceUsernameParam: true,
        usernameParamName: 'handle',
      }),
      (c) => {
        return c.json({
          success: true,
          data: {
            handle: c.req.param('handle'),
          },
        });
      },
    );

    const response = await app.request(`/users/${TEST_USERNAME}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        handle: TEST_USERNAME,
      },
    });
  });

  it('rejects when username enforcement is enabled but the configured route param is missing', async () => {
    const app = createTestApp();

    app.get(
      '/users',
      requireAuthMiddleware({
        enforceUsernameParam: true,
        usernameParamName: 'username',
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/users');

    expect(response.status).toBe(401);
  });
});

describe('requireScopesMiddleware', () => {
  it('requires every provided scope', async () => {
    const app = createTestApp({
      scopes: [AUTH_TOKEN_SCOPE.AUTH_READ, AUTH_TOKEN_SCOPE.USER_READ],
    });

    app.get(
      '/protected',
      requireScopesMiddleware([
        AUTH_TOKEN_SCOPE.AUTH_READ,
        AUTH_TOKEN_SCOPE.USER_READ,
      ]),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/protected');

    expect(response.status).toBe(200);
  });

  it('rejects when one provided scope is missing', async () => {
    const app = createTestApp({
      scopes: [AUTH_TOKEN_SCOPE.AUTH_READ],
    });

    app.get(
      '/protected',
      requireScopesMiddleware([
        AUTH_TOKEN_SCOPE.AUTH_READ,
        AUTH_TOKEN_SCOPE.USER_READ,
      ]),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/protected');

    expect(response.status).toBe(401);
  });
});

describe('requireAnyScopeMiddleware', () => {
  it('allows access when one provided scope is present', async () => {
    const app = createTestApp({
      scopes: [AUTH_TOKEN_SCOPE.USER_READ],
    });

    app.get(
      '/protected',
      requireAnyScopeMiddleware([
        AUTH_TOKEN_SCOPE.AUTH_WRITE,
        AUTH_TOKEN_SCOPE.USER_READ,
      ]),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/protected');

    expect(response.status).toBe(200);
  });

  it('rejects access when none of the provided scopes are present', async () => {
    const app = createTestApp({
      scopes: [AUTH_TOKEN_SCOPE.USER_READ],
    });

    app.get(
      '/protected',
      requireAnyScopeMiddleware([
        AUTH_TOKEN_SCOPE.AUTH_WRITE,
        AUTH_TOKEN_SCOPE.SESSION_WRITE,
      ]),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request('/protected');

    expect(response.status).toBe(401);
  });
});

describe('requireUsernameAuthMiddleware', () => {
  it('enforces the username param by default', async () => {
    const app = createTestApp({
      username: TEST_USERNAME,
    });

    app.get('/auth/:username', requireUsernameAuthMiddleware(), (c) => {
      return c.json({
        success: true,
      });
    });

    const allowedResponse = await app.request(`/auth/${TEST_USERNAME}`);
    const deniedResponse = await app.request('/auth/other-user');

    expect(allowedResponse.status).toBe(200);
    expect(deniedResponse.status).toBe(401);
  });

  it('passes through scope requirements from options', async () => {
    const app = createTestApp({
      username: TEST_USERNAME,
      scopes: [AUTH_TOKEN_SCOPE.USER_READ],
    });

    app.get(
      '/auth/:username',
      requireUsernameAuthMiddleware({
        requiredScopes: [AUTH_TOKEN_SCOPE.USER_READ],
      }),
      (c) => {
        return c.json({
          success: true,
        });
      },
    );

    const response = await app.request(`/auth/${TEST_USERNAME}`);

    expect(response.status).toBe(200);
  });
});

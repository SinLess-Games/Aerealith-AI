import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import type { AuthService } from '../services/auth.service';
import type { AuthContextMiddlewareOptions } from '../middleware/auth-context.middleware';
import type { AuthHonoEnv } from '../types/auth-context.type';

const routeMockState = vi.hoisted(() => {
  return {
    optionalAuthMiddleware: vi.fn(),

    createAuthPublicRoutes: vi.fn(),
    createAuthUsernameRoutes: vi.fn(),
    createAuthSessionRoutes: vi.fn(),
    createAuthEmailVerificationRoutes: vi.fn(),
    createAuthPasswordRoutes: vi.fn(),
  };
});

vi.mock('../middleware/optional-auth.middleware', () => {
  return {
    optionalAuthMiddleware: routeMockState.optionalAuthMiddleware,
  };
});

vi.mock('./auth-public.routes', () => {
  return {
    createAuthPublicRoutes: routeMockState.createAuthPublicRoutes,
  };
});

vi.mock('./auth-username.routes', () => {
  return {
    createAuthUsernameRoutes: routeMockState.createAuthUsernameRoutes,
  };
});

vi.mock('./auth-session.routes', () => {
  return {
    createAuthSessionRoutes: routeMockState.createAuthSessionRoutes,
  };
});

vi.mock('./auth-email-verification.routes', () => {
  return {
    createAuthEmailVerificationRoutes:
      routeMockState.createAuthEmailVerificationRoutes,
  };
});

vi.mock('./auth-password.routes', () => {
  return {
    createAuthPasswordRoutes: routeMockState.createAuthPasswordRoutes,
  };
});

import { authRoutes, createAuthRoutes } from './auth.routes';

type MockRouteName =
  | 'public'
  | 'username'
  | 'session'
  | 'email-verification'
  | 'password';

type MockRouteFactoryOptions = {
  routeName: MockRouteName;
  path: string;
};

const createMockAuthService = (): AuthService => {
  return {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),

    getAuthForUsername: vi.fn(),
    listSessionsForUsername: vi.fn(),
    revokeSessionForUsername: vi.fn(),

    createEmailVerificationToken: vi.fn(),
    verifyEmail: vi.fn(),

    changePassword: vi.fn(),
    createPasswordResetToken: vi.fn(),
    resetPassword: vi.fn(),

    revokeVerificationToken: vi.fn(),
  } as unknown as AuthService;
};

const createMockAuthContext = (): Omit<
  AuthContextMiddlewareOptions,
  'requireSession'
> => {
  return {
    userRepository: {
      findById: vi.fn(),
    },
    sessionRepository: {
      findActiveById: vi.fn(),
    },
    tokenService: {
      assertAccessToken: vi.fn(),
    },
  } as unknown as Omit<AuthContextMiddlewareOptions, 'requireSession'>;
};

const createMockRouteGroup = ({
  routeName,
  path,
}: MockRouteFactoryOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  routes.get(path, (c) => {
    return c.json({
      success: true,
      data: {
        route: routeName,
        path,
      },
    });
  });

  return routes;
};

const setupRouteMocks = (): void => {
  const optionalAuth: MiddlewareHandler<AuthHonoEnv> = async (c, next) => {
    await next();

    c.header('X-Optional-Auth', 'ran');
  };

  routeMockState.optionalAuthMiddleware.mockReturnValue(optionalAuth);

  routeMockState.createAuthPublicRoutes.mockReturnValue(
    createMockRouteGroup({
      routeName: 'public',
      path: '/public-probe',
    }),
  );

  routeMockState.createAuthUsernameRoutes.mockReturnValue(
    createMockRouteGroup({
      routeName: 'username',
      path: '/username-probe',
    }),
  );

  routeMockState.createAuthSessionRoutes.mockReturnValue(
    createMockRouteGroup({
      routeName: 'session',
      path: '/session-probe',
    }),
  );

  routeMockState.createAuthEmailVerificationRoutes.mockReturnValue(
    createMockRouteGroup({
      routeName: 'email-verification',
      path: '/email-verification-probe',
    }),
  );

  routeMockState.createAuthPasswordRoutes.mockReturnValue(
    createMockRouteGroup({
      routeName: 'password',
      path: '/password-probe',
    }),
  );
};

const createTestRoutes = () => {
  setupRouteMocks();

  const authService = createMockAuthService();
  const authContext = createMockAuthContext();

  const routes = createAuthRoutes({
    authService,
    authContext,
  });

  return {
    routes,
    authService,
    authContext,
  };
};

describe('auth.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports authRoutes as an alias for createAuthRoutes', () => {
    expect(authRoutes).toBe(createAuthRoutes);
  });

  it('registers optional auth middleware with requireSession omitted and strict disabled', () => {
    const { authContext } = createTestRoutes();

    expect(routeMockState.optionalAuthMiddleware).toHaveBeenCalledTimes(1);
    expect(routeMockState.optionalAuthMiddleware).toHaveBeenCalledWith({
      ...authContext,
      strict: false,
    });
  });

  it('injects authService into every child route group', () => {
    const { authService } = createTestRoutes();

    expect(routeMockState.createAuthPublicRoutes).toHaveBeenCalledWith({
      authService,
    });
    expect(routeMockState.createAuthUsernameRoutes).toHaveBeenCalledWith({
      authService,
    });
    expect(routeMockState.createAuthSessionRoutes).toHaveBeenCalledWith({
      authService,
    });
    expect(
      routeMockState.createAuthEmailVerificationRoutes,
    ).toHaveBeenCalledWith({
      authService,
    });
    expect(routeMockState.createAuthPasswordRoutes).toHaveBeenCalledWith({
      authService,
    });
  });

  it('creates each child route group exactly once', () => {
    createTestRoutes();

    expect(routeMockState.createAuthPublicRoutes).toHaveBeenCalledTimes(1);
    expect(routeMockState.createAuthUsernameRoutes).toHaveBeenCalledTimes(1);
    expect(routeMockState.createAuthSessionRoutes).toHaveBeenCalledTimes(1);
    expect(
      routeMockState.createAuthEmailVerificationRoutes,
    ).toHaveBeenCalledTimes(1);
    expect(routeMockState.createAuthPasswordRoutes).toHaveBeenCalledTimes(1);
  });

  it('mounts the public route group', async () => {
    const { routes } = createTestRoutes();

    const response = await routes.request('/public-probe');

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Optional-Auth')).toBe('ran');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        route: 'public',
        path: '/public-probe',
      },
    });
  });

  it('mounts the username route group', async () => {
    const { routes } = createTestRoutes();

    const response = await routes.request('/username-probe');

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Optional-Auth')).toBe('ran');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        route: 'username',
        path: '/username-probe',
      },
    });
  });

  it('mounts the session route group', async () => {
    const { routes } = createTestRoutes();

    const response = await routes.request('/session-probe');

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Optional-Auth')).toBe('ran');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        route: 'session',
        path: '/session-probe',
      },
    });
  });

  it('mounts the email verification route group', async () => {
    const { routes } = createTestRoutes();

    const response = await routes.request('/email-verification-probe');

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Optional-Auth')).toBe('ran');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        route: 'email-verification',
        path: '/email-verification-probe',
      },
    });
  });

  it('mounts the password route group', async () => {
    const { routes } = createTestRoutes();

    const response = await routes.request('/password-probe');

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Optional-Auth')).toBe('ran');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        route: 'password',
        path: '/password-probe',
      },
    });
  });

  it('keeps static email verification routes ahead of the username catch-all', async () => {
    setupRouteMocks();

    const usernameRoutes = new Hono<AuthHonoEnv>();
    usernameRoutes.get('/:username', (c) => {
      return c.json({
        success: true,
        data: {
          route: 'username',
          username: c.req.param('username'),
        },
      });
    });

    const emailVerificationRoutes = new Hono<AuthHonoEnv>();
    emailVerificationRoutes.get('/verify-email', (c) => {
      return c.json({
        success: true,
        data: {
          route: 'email-verification',
        },
      });
    });

    routeMockState.createAuthUsernameRoutes.mockReturnValue(usernameRoutes);
    routeMockState.createAuthEmailVerificationRoutes.mockReturnValue(
      emailVerificationRoutes,
    );

    const routes = createAuthRoutes({
      authService: createMockAuthService(),
      authContext: createMockAuthContext(),
    });

    const response = await routes.request('/verify-email?token=test-token');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        route: 'email-verification',
      },
    });
  });

  it('can be mounted under /auth by a parent Hono app', async () => {
    const { routes } = createTestRoutes();
    const app = new Hono<AuthHonoEnv>();

    app.route('/auth', routes);

    const response = await app.request('/auth/public-probe');

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Optional-Auth')).toBe('ran');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        route: 'public',
        path: '/public-probe',
      },
    });
  });

  it('returns 404 for unknown auth routes', async () => {
    const { routes } = createTestRoutes();

    const response = await routes.request('/missing-route');

    expect(response.status).toBe(404);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import type { AuthService } from './services/auth.service';
import type { AuthContextMiddlewareOptions } from './middleware/auth-context.middleware';
import type { AuthHonoEnv } from './types/auth-context.type';

const appMockState = vi.hoisted(() => {
  return {
    honoCorsMiddleware: vi.fn(),
    honoErrorMiddleware: vi.fn(),
    honoRequestIdMiddleware: vi.fn(),
    honoStructuredLoggerMiddleware: vi.fn(),

    createAuthRoutes: vi.fn(),
  };
});

vi.mock('@aerealith-ai/api', () => {
  return {
    honoCorsMiddleware: appMockState.honoCorsMiddleware,
    honoErrorMiddleware: appMockState.honoErrorMiddleware,
    honoRequestIdMiddleware: appMockState.honoRequestIdMiddleware,
    honoStructuredLoggerMiddleware: appMockState.honoStructuredLoggerMiddleware,
  };
});

vi.mock('./routes', () => {
  return {
    createAuthRoutes: appMockState.createAuthRoutes,
  };
});

import { createApp, createAuthApp } from './app';

type MockAuthService = {
  register: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;

  getAuthForUsername: ReturnType<typeof vi.fn>;
  listSessionsForUsername: ReturnType<typeof vi.fn>;
  revokeSessionForUsername: ReturnType<typeof vi.fn>;

  createEmailVerificationToken: ReturnType<typeof vi.fn>;
  verifyEmail: ReturnType<typeof vi.fn>;

  changePassword: ReturnType<typeof vi.fn>;
  createPasswordResetToken: ReturnType<typeof vi.fn>;
  resetPassword: ReturnType<typeof vi.fn>;

  revokeVerificationToken: ReturnType<typeof vi.fn>;
};

type ServiceMetadataResponse = {
  success: true;
  data: {
    service: string;
    status: 'ok';
    version: string;
    timestamp: string;
  };
};

type ReadinessMetadataResponse = {
  success: true;
  data: {
    service: string;
    ready: true;
    timestamp: string;
  };
};

const TEST_SERVICE_NAME = 'helix-auth-service-test';
const TEST_SERVICE_VERSION = '1.2.3-test';

const HTTP_HEADER = {
  X_CORS: 'X-Test-Cors',
  X_ERROR: 'X-Test-Error',
  X_REQUEST_ID: 'X-Test-Request-Id',
  X_STRUCTURED_LOGGER: 'X-Test-Structured-Logger',
} as const;

const createHeaderMiddleware = (
  headerName: string,
  headerValue: string,
): MiddlewareHandler<AuthHonoEnv> => {
  return async (c, next) => {
    await next();

    c.header(headerName, headerValue);
  };
};

const createErrorMiddleware = (): MiddlewareHandler<AuthHonoEnv> => {
  return async (c, next) => {
    await next();

    c.header(HTTP_HEADER.X_ERROR, 'ran');
  };
};

const createMockAuthService = (): MockAuthService => {
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
  };
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

const createMockAuthRoutes = (): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  routes.get('/probe', (c) => {
    return c.json({
      success: true,
      data: {
        route: 'auth',
      },
    });
  });

  routes.post('/probe', async (c) => {
    const body = await c.req.json();

    return c.json(
      {
        success: true,
        data: {
          route: 'auth',
          body,
        },
      },
      201,
    );
  });

  return routes;
};

const setupMocks = (): void => {
  appMockState.honoRequestIdMiddleware.mockReturnValue(
    createHeaderMiddleware(HTTP_HEADER.X_REQUEST_ID, 'ran'),
  );

  appMockState.honoErrorMiddleware.mockReturnValue(createErrorMiddleware());

  appMockState.honoStructuredLoggerMiddleware.mockReturnValue(
    createHeaderMiddleware(HTTP_HEADER.X_STRUCTURED_LOGGER, 'ran'),
  );

  appMockState.honoCorsMiddleware.mockReturnValue(
    createHeaderMiddleware(HTTP_HEADER.X_CORS, 'ran'),
  );

  appMockState.createAuthRoutes.mockReturnValue(createMockAuthRoutes());
};

const createTestApp = ({
  authService = createMockAuthService(),
  authContext = createMockAuthContext(),
  serviceName = TEST_SERVICE_NAME,
  version = TEST_SERVICE_VERSION,
}: {
  authService?: MockAuthService;
  authContext?: Omit<AuthContextMiddlewareOptions, 'requireSession'>;
  serviceName?: string;
  version?: string;
} = {}) => {
  setupMocks();

  const app = createAuthApp({
    authService: authService as unknown as AuthService,
    authContext,
    serviceName,
    version,
  });

  return {
    app,
    authService,
    authContext,
  };
};

describe('app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports createApp as an alias for createAuthApp', () => {
    expect(createApp).toBe(createAuthApp);
  });

  it('creates the shared API middleware during app composition', () => {
    createTestApp();

    expect(appMockState.honoRequestIdMiddleware).toHaveBeenCalledTimes(1);
    expect(appMockState.honoErrorMiddleware).toHaveBeenCalledTimes(1);
    expect(appMockState.honoStructuredLoggerMiddleware).toHaveBeenCalledTimes(
      1,
    );
    expect(appMockState.honoCorsMiddleware).toHaveBeenCalledTimes(1);
  });

  it('injects authService and authContext into createAuthRoutes', () => {
    const { authService, authContext } = createTestApp();

    expect(appMockState.createAuthRoutes).toHaveBeenCalledTimes(1);
    expect(appMockState.createAuthRoutes).toHaveBeenCalledWith({
      authService,
      authContext,
    });
  });

  it('returns service metadata from GET /', async () => {
    const { app } = createTestApp();

    const response = await app.request('/');

    expect(response.status).toBe(200);
    expect(response.headers.get(HTTP_HEADER.X_REQUEST_ID)).toBe('ran');
    expect(response.headers.get(HTTP_HEADER.X_ERROR)).toBe('ran');
    expect(response.headers.get(HTTP_HEADER.X_STRUCTURED_LOGGER)).toBe('ran');
    expect(response.headers.get(HTTP_HEADER.X_CORS)).toBe('ran');

    const body = (await response.json()) as ServiceMetadataResponse;

    expect(body).toMatchObject({
      success: true,
      data: {
        service: TEST_SERVICE_NAME,
        status: 'ok',
        version: TEST_SERVICE_VERSION,
        timestamp: expect.any(String),
      },
    });

    expect(new Date(body.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('returns service metadata from GET /health', async () => {
    const { app } = createTestApp();

    const response = await app.request('/health');

    expect(response.status).toBe(200);

    const body = (await response.json()) as ServiceMetadataResponse;

    expect(body).toMatchObject({
      success: true,
      data: {
        service: TEST_SERVICE_NAME,
        status: 'ok',
        version: TEST_SERVICE_VERSION,
        timestamp: expect.any(String),
      },
    });

    expect(new Date(body.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('returns readiness metadata from GET /ready', async () => {
    const { app } = createTestApp();

    const response = await app.request('/ready');

    expect(response.status).toBe(200);

    const body = (await response.json()) as ReadinessMetadataResponse;

    expect(body).toMatchObject({
      success: true,
      data: {
        service: TEST_SERVICE_NAME,
        ready: true,
        timestamp: expect.any(String),
      },
    });

    expect(new Date(body.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('uses default service metadata when serviceName and version are omitted', async () => {
    setupMocks();

    const app = createAuthApp({
      authService: createMockAuthService() as unknown as AuthService,
      authContext: createMockAuthContext(),
    });

    const response = await app.request('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        service: 'helix-auth-service',
        status: 'ok',
        version: '0.0.1',
        timestamp: expect.any(String),
      },
    });
  });

  it('mounts auth routes under /auth', async () => {
    const { app } = createTestApp();

    const response = await app.request('/auth/probe');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        route: 'auth',
      },
    });
  });

  it('passes POST requests through the mounted /auth route group', async () => {
    const { app } = createTestApp();

    const response = await app.request('/auth/probe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hello: 'world',
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        route: 'auth',
        body: {
          hello: 'world',
        },
      },
    });
  });

  it('applies shared middleware to mounted auth routes', async () => {
    const { app } = createTestApp();

    const response = await app.request('/auth/probe');

    expect(response.status).toBe(200);
    expect(response.headers.get(HTTP_HEADER.X_REQUEST_ID)).toBe('ran');
    expect(response.headers.get(HTTP_HEADER.X_ERROR)).toBe('ran');
    expect(response.headers.get(HTTP_HEADER.X_STRUCTURED_LOGGER)).toBe('ran');
    expect(response.headers.get(HTTP_HEADER.X_CORS)).toBe('ran');
  });

  it('returns JSON 404 for unknown routes', async () => {
    const { app } = createTestApp();

    const response = await app.request('/missing-route');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
    });
  });

  it('returns JSON 404 for unknown nested auth routes', async () => {
    const { app } = createTestApp();

    const response = await app.request('/auth/missing-route');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
    });
  });
});

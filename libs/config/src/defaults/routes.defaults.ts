import type {
  RouteAuthMode,
  RouteCacheMode,
  RouteConfig,
  RouteCorsConfig,
  RouteExposure,
  RouteGroupConfig,
  RouteHttpMethod,
  RouteRateLimitConfig,
  RoutesConfig,
} from '../types/routes';

const defaultPublicCorsConfig: RouteCorsConfig = {
  enabled: true,
  allowedOrigins: ['https://helixaibot.com'],
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'X-Request-Id',
    'X-Tenant-Id',
    'X-Session-Id',
  ],
  exposedHeaders: ['X-Request-Id'],
  credentials: true,
  maxAgeSeconds: 86_400,
};

const defaultLocalCorsConfig: RouteCorsConfig = {
  ...defaultPublicCorsConfig,
  allowedOrigins: [
    'http://localhost:3000',
    'http://localhost:4200',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:4200',
    'https://helixaibot.com',
  ],
};

const defaultPrivateCacheConfig = {
  mode: 'private',
  maxAgeSeconds: 0,
} satisfies {
  mode: RouteCacheMode;
  maxAgeSeconds: number;
};

const defaultNoStoreCacheConfig = {
  mode: 'no-store',
} satisfies {
  mode: RouteCacheMode;
};

const defaultPublicRateLimitConfig: RouteRateLimitConfig = {
  enabled: true,
  limit: 120,
  windowSeconds: 60,
  keyBy: 'ip',
};

const defaultAuthenticatedRateLimitConfig: RouteRateLimitConfig = {
  enabled: true,
  limit: 300,
  windowSeconds: 60,
  keyBy: 'user',
};

function createRoute(options: {
  name: string;
  method: RouteHttpMethod;
  path: `/${string}`;
  fullPath: `/api/${string}`;
  description: string;
  exposure?: RouteExposure;
  auth?: RouteAuthMode;
  tags?: string[];
  rateLimit?: RouteRateLimitConfig;
  cache?: RouteConfig['cache'];
  cors?: RouteCorsConfig;
}): RouteConfig {
  return {
    enabled: true,
    name: options.name,
    method: options.method,
    path: options.path,
    fullPath: options.fullPath,
    description: options.description,
    exposure: options.exposure ?? 'public',
    auth: options.auth ?? 'required',
    tags: options.tags ?? [],
    rateLimit: options.rateLimit,
    cache: options.cache ?? defaultNoStoreCacheConfig,
    cors: options.cors,
  };
}

function createHealthRoute(options: {
  serviceName: string;
  path: `/${string}`;
  fullPath: `/api/${string}`;
}): RouteConfig {
  return createRoute({
    name: `${options.serviceName}.health`,
    method: 'GET',
    path: options.path,
    fullPath: options.fullPath,
    description: `Health endpoint for ${options.serviceName}.`,
    exposure: 'public',
    auth: 'none',
    tags: ['health', options.serviceName],
    rateLimit: defaultPublicRateLimitConfig,
    cache: {
      mode: 'no-store',
    },
  });
}

const authRouteGroup: RouteGroupConfig = {
  enabled: true,
  name: 'auth',
  displayName: 'Auth Service',
  basePath: '/api/V1/auth',
  healthPath: '/api/V1/auth/health',
  description: 'Authentication, sessions, verification, and account access.',
  tags: ['auth', 'identity', 'security'],
  routes: {
    health: createHealthRoute({
      serviceName: 'auth',
      path: '/health',
      fullPath: '/api/V1/auth/health',
    }),
    register: createRoute({
      name: 'auth.register',
      method: 'POST',
      path: '/register',
      fullPath: '/api/V1/auth/register',
      description: 'Register a new user account.',
      auth: 'none',
      tags: ['auth', 'register'],
      rateLimit: defaultPublicRateLimitConfig,
      cors: defaultPublicCorsConfig,
    }),
    login: createRoute({
      name: 'auth.login',
      method: 'POST',
      path: '/login',
      fullPath: '/api/V1/auth/login',
      description: 'Authenticate a user and create a session.',
      auth: 'none',
      tags: ['auth', 'login'],
      rateLimit: defaultPublicRateLimitConfig,
      cors: defaultPublicCorsConfig,
    }),
    logout: createRoute({
      name: 'auth.logout',
      method: 'POST',
      path: '/logout',
      fullPath: '/api/V1/auth/logout',
      description: 'End the current authenticated session.',
      tags: ['auth', 'logout', 'session'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
      cors: defaultPublicCorsConfig,
    }),
    session: createRoute({
      name: 'auth.session',
      method: 'GET',
      path: '/session',
      fullPath: '/api/V1/auth/session',
      description: 'Read the current authenticated session.',
      tags: ['auth', 'session'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
      cache: defaultPrivateCacheConfig,
      cors: defaultPublicCorsConfig,
    }),
    refresh: createRoute({
      name: 'auth.refresh',
      method: 'POST',
      path: '/refresh',
      fullPath: '/api/V1/auth/refresh',
      description: 'Refresh the current authenticated session.',
      tags: ['auth', 'session', 'refresh'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
      cors: defaultPublicCorsConfig,
    }),
    verifyEmail: createRoute({
      name: 'auth.verify-email',
      method: 'POST',
      path: '/verify-email',
      fullPath: '/api/V1/auth/verify-email',
      description: 'Verify an email address using a verification token.',
      auth: 'none',
      tags: ['auth', 'verification'],
      rateLimit: defaultPublicRateLimitConfig,
      cors: defaultPublicCorsConfig,
    }),
  },
};

const usersRouteGroup: RouteGroupConfig = {
  enabled: true,
  name: 'users',
  displayName: 'User Service',
  basePath: '/api/V1/users',
  healthPath: '/api/V1/users/health',
  description: 'User accounts, public profiles, and user settings.',
  tags: ['users', 'profiles', 'settings'],
  routes: {
    health: createHealthRoute({
      serviceName: 'users',
      path: '/health',
      fullPath: '/api/V1/users/health',
    }),
    list: createRoute({
      name: 'users.list',
      method: 'GET',
      path: '/',
      fullPath: '/api/V1/users',
      description: 'List users.',
      exposure: 'admin',
      auth: 'admin',
      tags: ['users', 'admin'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
      cache: defaultPrivateCacheConfig,
    }),
    create: createRoute({
      name: 'users.create',
      method: 'POST',
      path: '/',
      fullPath: '/api/V1/users',
      description: 'Create a user record.',
      exposure: 'internal',
      auth: 'service',
      tags: ['users', 'create', 'internal'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
    }),
    getByUsername: createRoute({
      name: 'users.get-by-username',
      method: 'GET',
      path: '/:username',
      fullPath: '/api/V1/users/:username',
      description: 'Read a user by username.',
      auth: 'optional',
      tags: ['users', 'profile'],
      rateLimit: defaultPublicRateLimitConfig,
      cache: defaultPrivateCacheConfig,
      cors: defaultPublicCorsConfig,
    }),
    updateByUsername: createRoute({
      name: 'users.update-by-username',
      method: 'PATCH',
      path: '/:username',
      fullPath: '/api/V1/users/:username',
      description: 'Update a user by username.',
      auth: 'owner',
      tags: ['users', 'update'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
      cors: defaultPublicCorsConfig,
    }),
    deleteByUsername: createRoute({
      name: 'users.delete-by-username',
      method: 'DELETE',
      path: '/:username',
      fullPath: '/api/V1/users/:username',
      description: 'Delete or deactivate a user by username.',
      auth: 'owner',
      tags: ['users', 'delete'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
      cors: defaultPublicCorsConfig,
    }),
    profile: createRoute({
      name: 'users.profile',
      method: 'GET',
      path: '/:username/profile',
      fullPath: '/api/V1/users/:username/profile',
      description: 'Read a user profile by username.',
      auth: 'optional',
      tags: ['users', 'profile'],
      rateLimit: defaultPublicRateLimitConfig,
      cache: defaultPrivateCacheConfig,
      cors: defaultPublicCorsConfig,
    }),
    settings: createRoute({
      name: 'users.settings',
      method: 'GET',
      path: '/:username/settings',
      fullPath: '/api/V1/users/:username/settings',
      description: 'Read user settings by username.',
      exposure: 'private',
      auth: 'owner',
      tags: ['users', 'settings'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
      cache: defaultPrivateCacheConfig,
      cors: defaultPublicCorsConfig,
    }),
  },
};

const waitlistRouteGroup: RouteGroupConfig = {
  enabled: true,
  name: 'waitlist',
  displayName: 'Waitlist',
  basePath: '/api/V1/waitlist',
  healthPath: '/api/V1/waitlist/health',
  description: 'Public waitlist signup and internal waitlist administration.',
  tags: ['waitlist', 'marketing'],
  routes: {
    health: createHealthRoute({
      serviceName: 'waitlist',
      path: '/health',
      fullPath: '/api/V1/waitlist/health',
    }),
    create: createRoute({
      name: 'waitlist.create',
      method: 'POST',
      path: '/',
      fullPath: '/api/V1/waitlist',
      description: 'Create a waitlist entry.',
      auth: 'none',
      tags: ['waitlist', 'signup'],
      rateLimit: defaultPublicRateLimitConfig,
      cors: defaultPublicCorsConfig,
    }),
    list: createRoute({
      name: 'waitlist.list',
      method: 'GET',
      path: '/',
      fullPath: '/api/V1/waitlist',
      description: 'List waitlist entries.',
      exposure: 'admin',
      auth: 'admin',
      tags: ['waitlist', 'admin'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
      cache: defaultPrivateCacheConfig,
    }),
    deleteByEmail: createRoute({
      name: 'waitlist.delete-by-email',
      method: 'DELETE',
      path: '/:email',
      fullPath: '/api/V1/waitlist/:email',
      description: 'Delete a waitlist entry by email.',
      exposure: 'admin',
      auth: 'admin',
      tags: ['waitlist', 'admin', 'delete'],
      rateLimit: defaultAuthenticatedRateLimitConfig,
    }),
  },
};

export const defaultRoutesConfig: RoutesConfig = {
  enabled: true,
  apiVersion: 'V1',
  apiBasePath: '/api/V1',
  healthPath: '/api/V1/health',
  registry: {
    auth: authRouteGroup,
    users: usersRouteGroup,
    waitlist: waitlistRouteGroup,
  },
};

export const defaultLocalRoutesConfig: RoutesConfig = {
  ...defaultRoutesConfig,
  registry: {
    ...defaultRoutesConfig.registry,
    auth: {
      ...authRouteGroup,
      routes: Object.fromEntries(
        Object.entries(authRouteGroup.routes).map(([key, route]) => [
          key,
          {
            ...route,
            cors: route.cors ? defaultLocalCorsConfig : route.cors,
          },
        ]),
      ),
    },
    users: {
      ...usersRouteGroup,
      routes: Object.fromEntries(
        Object.entries(usersRouteGroup.routes).map(([key, route]) => [
          key,
          {
            ...route,
            cors: route.cors ? defaultLocalCorsConfig : route.cors,
          },
        ]),
      ),
    },
    waitlist: {
      ...waitlistRouteGroup,
      routes: Object.fromEntries(
        Object.entries(waitlistRouteGroup.routes).map(([key, route]) => [
          key,
          {
            ...route,
            cors: route.cors ? defaultLocalCorsConfig : route.cors,
          },
        ]),
      ),
    },
  },
};

export const defaultCloudflareRoutesConfig: RoutesConfig = {
  ...defaultRoutesConfig,
};
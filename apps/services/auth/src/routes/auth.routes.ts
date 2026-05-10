import { Hono } from 'hono';

import type { AuthService } from '../services/auth.service';
import { optionalAuthMiddleware } from '../middleware/optional-auth.middleware';
import type { AuthContextMiddlewareOptions } from '../middleware/auth-context.middleware';
import type { AuthHonoEnv } from '../types/auth-context.type';

import { createAuthEmailVerificationRoutes } from './auth-email-verification.routes';
import { createAuthPasswordRoutes } from './auth-password.routes';
import { createAuthPublicRoutes } from './auth-public.routes';
import { createAuthSessionRoutes } from './auth-session.routes';
import { createAuthUsernameRoutes } from './auth-username.routes';

export type AuthRoutesOptions = {
  authService: AuthService;
  authContext: Omit<AuthContextMiddlewareOptions, 'requireSession'>;
};

export const createAuthRoutes = ({
  authService,
  authContext,
}: AuthRoutesOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  routes.use(
    '*',
    optionalAuthMiddleware({
      ...authContext,
      strict: false,
    }),
  );

  routes.route(
    '/',
    createAuthPublicRoutes({
      authService,
    }),
  );

  routes.route(
    '/',
    createAuthUsernameRoutes({
      authService,
    }),
  );

  routes.route(
    '/',
    createAuthSessionRoutes({
      authService,
    }),
  );

  routes.route(
    '/',
    createAuthEmailVerificationRoutes({
      authService,
    }),
  );

  routes.route(
    '/',
    createAuthPasswordRoutes({
      authService,
    }),
  );

  return routes;
};

export { createAuthRoutes as authRoutes };

import { Hono } from 'hono';

import type { AuthService } from '../services/auth.service';
import { optionalAuthMiddleware } from '../middleware/optional-auth.middleware';
import type { AuthContextMiddlewareOptions } from '../middleware/auth-context.middleware';
import type { AuthHonoEnv } from '../types/auth-context.type';
import type { ObservabilityLogger } from '@aerealith-ai/observability';

import {
  createAuthEmailVerificationRoutes,
  type AuthEmailVerificationMailer as AuthEmailVerificationRouteMailer,
} from './auth-email-verification.routes';
import { createAuthPasswordRoutes } from './auth-password.routes';
import {
  createAuthPublicRoutes,
  type AuthEmailVerificationMailer as AuthPublicRouteMailer,
} from './auth-public.routes';
import { createAuthSessionRoutes } from './auth-session.routes';
import { createAuthUsernameRoutes } from './auth-username.routes';

export type AuthRoutesEmailVerificationMailer = NonNullable<
  AuthPublicRouteMailer
> &
  NonNullable<AuthEmailVerificationRouteMailer>;

export type AuthRoutesOptions = {
  authService: AuthService;
  authContext: Omit<AuthContextMiddlewareOptions, 'requireSession'>;
  emailVerificationMailer?: AuthRoutesEmailVerificationMailer;
  logger?: ObservabilityLogger;
};

export const createAuthRoutes = ({
  authService,
  authContext,
  emailVerificationMailer,
  logger,
}: AuthRoutesOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  const emailVerificationMailerOptions =
    emailVerificationMailer === undefined ? {} : { emailVerificationMailer };

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
      logger,
      ...emailVerificationMailerOptions,
    }),
  );

  routes.route(
    '/',
    createAuthEmailVerificationRoutes({
      authService,
      ...emailVerificationMailerOptions,
    }),
  );

  routes.route(
    '/',
    createAuthPasswordRoutes({
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

  return routes;
};

export { createAuthRoutes as authRoutes };
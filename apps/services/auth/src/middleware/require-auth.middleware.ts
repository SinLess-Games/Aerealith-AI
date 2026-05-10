import type { MiddlewareHandler } from 'hono';

import { AuthError } from '@helix-ai/api';
import { canAccessUsername } from '@helix-ai/contracts';

import {
  authContextHasEveryScope,
  authContextHasSomeScope,
  getAuthContext,
  isAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
  type AuthenticatedAuthContext,
} from '../types/auth-context.type';
import type { AuthTokenScope } from '../types/auth-token.type';

export type RequireAuthMiddlewareOptions = {
  /**
   * Required token scopes.
   */
  requiredScopes?: AuthTokenScope[];

  /**
   * When true, every scope in requiredScopes must be present.
   * When false, at least one scope in requiredScopes must be present.
   *
   * Default: true
   */
  requireEveryScope?: boolean;

  /**
   * When true, the authenticated username must match the route username param,
   * unless isAdmin returns true.
   *
   * Example route:
   * GET /auth/:username
   */
  enforceUsernameParam?: boolean;

  /**
   * Route param name used for username access checks.
   *
   * Default: username
   */
  usernameParamName?: string;

  /**
   * Optional admin check. Use this later when RBAC/ABAC lands.
   */
  isAdmin?: (
    auth: AuthenticatedAuthContext,
    context: AuthContextHonoContext,
  ) => boolean | Promise<boolean>;
};

const DEFAULT_USERNAME_PARAM_NAME = 'username';

const getRouteParam = (
  context: AuthContextHonoContext,
  name: string,
): string | undefined => {
  const value = context.req.param(name);

  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  return value.trim();
};

const normalizeUsername = (username: string): string => {
  return username.trim().toLowerCase();
};

const assertAuthenticated = (
  context: AuthContextHonoContext,
): AuthenticatedAuthContext => {
  const auth = getAuthContext(context);

  if (!isAuthenticatedAuthContext(auth)) {
    throw AuthError.unauthorized();
  }

  return auth;
};

const assertRequiredScopes = (
  auth: AuthenticatedAuthContext,
  requiredScopes: AuthTokenScope[] | undefined,
  requireEveryScope: boolean,
): void => {
  if (requiredScopes === undefined || requiredScopes.length === 0) {
    return;
  }

  const hasScopes = requireEveryScope
    ? authContextHasEveryScope(auth, requiredScopes)
    : authContextHasSomeScope(auth, requiredScopes);

  if (!hasScopes) {
    throw AuthError.tokenScopeMissing(requiredScopes);
  }
};

const assertUsernameParamAccess = async ({
  auth,
  context,
  enforceUsernameParam,
  usernameParamName,
  isAdmin,
}: {
  auth: AuthenticatedAuthContext;
  context: AuthContextHonoContext;
  enforceUsernameParam: boolean;
  usernameParamName: string;
  isAdmin?: RequireAuthMiddlewareOptions['isAdmin'];
}): Promise<void> => {
  if (!enforceUsernameParam) {
    return;
  }

  const requestedUsername = getRouteParam(context, usernameParamName);

  if (requestedUsername === undefined) {
    throw AuthError.forbidden(
      `Missing required route parameter: ${usernameParamName}`,
    );
  }

  const authenticatedUsername = normalizeUsername(auth.user.username);
  const normalizedRequestedUsername = normalizeUsername(requestedUsername);
  const admin = (await isAdmin?.(auth, context)) ?? false;

  if (
    !canAccessUsername({
      authenticatedUsername,
      requestedUsername: normalizedRequestedUsername,
      isAdmin: admin,
    })
  ) {
    throw AuthError.usernameAccessDenied(
      authenticatedUsername,
      normalizedRequestedUsername,
    );
  }
};

export const requireAuthMiddleware = ({
  requiredScopes,
  requireEveryScope = true,
  enforceUsernameParam = false,
  usernameParamName = DEFAULT_USERNAME_PARAM_NAME,
  isAdmin,
}: RequireAuthMiddlewareOptions = {}): MiddlewareHandler<AuthHonoEnv> => {
  return async (c, next) => {
    const context = c as AuthContextHonoContext;
    const auth = assertAuthenticated(context);

    assertRequiredScopes(auth, requiredScopes, requireEveryScope);

    await assertUsernameParamAccess({
      auth,
      context,
      enforceUsernameParam,
      usernameParamName,
      isAdmin,
    });

    return next();
  };
};

export const requireScopesMiddleware = (
  requiredScopes: AuthTokenScope[],
  options: Omit<RequireAuthMiddlewareOptions, 'requiredScopes'> = {},
): MiddlewareHandler<AuthHonoEnv> => {
  return requireAuthMiddleware({
    ...options,
    requiredScopes,
  });
};

export const requireAnyScopeMiddleware = (
  requiredScopes: AuthTokenScope[],
  options: Omit<
    RequireAuthMiddlewareOptions,
    'requiredScopes' | 'requireEveryScope'
  > = {},
): MiddlewareHandler<AuthHonoEnv> => {
  return requireAuthMiddleware({
    ...options,
    requiredScopes,
    requireEveryScope: false,
  });
};

export const requireUsernameAuthMiddleware = (
  options: Omit<RequireAuthMiddlewareOptions, 'enforceUsernameParam'> = {},
): MiddlewareHandler<AuthHonoEnv> => {
  return requireAuthMiddleware({
    ...options,
    enforceUsernameParam: true,
  });
};

export { requireAuthMiddleware as createRequireAuthMiddleware };

import type { MiddlewareHandler } from 'hono';

import { AuthError } from '@helix-ai/api';

import {
  authContextMiddleware,
  type AuthContextMiddlewareOptions,
} from './auth-context.middleware';
import {
  setAnonymousAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
} from '../types/auth-context.type';

export type OptionalAuthMiddlewareOptions = Omit<
  AuthContextMiddlewareOptions,
  'requireSession'
> & {
  /**
   * When true, invalid/expired auth credentials throw instead of falling back to
   * anonymous auth.
   */
  strict?: boolean;

  /**
   * Optional hook for logging/metrics when optional auth fails.
   */
  onAuthError?: (
    error: unknown,
    context: AuthContextHonoContext,
  ) => void | Promise<void>;
};

const isOptionalAuthError = (error: unknown): boolean => {
  if (error instanceof AuthError) {
    return true;
  }

  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const record = error as Record<string, unknown>;

  return (
    record.name === 'AuthError' ||
    (typeof record.code === 'string' && record.code.startsWith('AUTH_'))
  );
};

export const optionalAuthMiddleware = ({
  strict = false,
  onAuthError,
  ...authOptions
}: OptionalAuthMiddlewareOptions): MiddlewareHandler<AuthHonoEnv> => {
  const middleware = authContextMiddleware({
    ...authOptions,
    requireSession: false,
  });

  return async (c, next) => {
    const context = c as AuthContextHonoContext;

    setAnonymousAuthContext(context);

    let reachedDownstream = false;

    try {
      return await middleware(c, async () => {
        reachedDownstream = true;

        return next();
      });
    } catch (error) {
      /**
       * Never swallow errors from route handlers or downstream middleware.
       * Optional auth should only soften auth parsing/validation failures that
       * happen before the request reaches the protected route chain.
       */
      if (reachedDownstream) {
        throw error;
      }

      if (strict || !isOptionalAuthError(error)) {
        throw error;
      }

      await onAuthError?.(error, context);

      setAnonymousAuthContext(context);

      return next();
    }
  };
};

export { optionalAuthMiddleware as createOptionalAuthMiddleware };

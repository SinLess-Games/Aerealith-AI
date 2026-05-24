import { Hono } from 'hono';

import { AuthError } from '@aerealith-ai/api';
import { AuthSessionSchemas } from '@aerealith-ai/contracts';

import type { AuthService } from '../services/auth.service';
import {
  getAuthContext,
  isAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
} from '../types/auth-context.type';
import { requireUsernameAuthMiddleware } from '../middleware/require-auth.middleware';

export type AuthUsernameRoutesOptions = {
  authService: AuthService;
};

export type ApiSuccessResponse<TData> = {
  success: true;
  data: TData;
};

export type ApiValidationErrorResponse = {
  success: false;
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details?: unknown;
  };
};

const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
} as const;

const USERNAME_PARAM = 'username';

const successResponse = <TData>(data: TData): ApiSuccessResponse<TData> => {
  return {
    success: true,
    data,
  };
};

const getAuthenticatedUsername = (context: AuthContextHonoContext): string => {
  const auth = getAuthContext(context);

  if (!isAuthenticatedAuthContext(auth)) {
    throw AuthError.unauthorized();
  }

  return auth.user.username;
};

const getRequestedUsername = (context: AuthContextHonoContext): string => {
  const username = context.req.param(USERNAME_PARAM);

  const parsed = AuthSessionSchemas.authUsernameParamsSchema.safeParse({
    username,
  });

  if (!parsed.success) {
    throw AuthError.userNotFound(username);
  }

  return parsed.data.username;
};

export const createAuthUsernameRoutes = ({
  authService,
}: AuthUsernameRoutesOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  routes.use(
    `/:${USERNAME_PARAM}`,
    requireUsernameAuthMiddleware({
      usernameParamName: USERNAME_PARAM,
    }),
  );

  routes.get(`/:${USERNAME_PARAM}`, async (c) => {
    const context = c as AuthContextHonoContext;
    const requestedUsername = getRequestedUsername(context);
    const authenticatedUsername = getAuthenticatedUsername(context);

    const result = await authService.getAuthForUsername(
      authenticatedUsername,
      requestedUsername,
    );

    return c.json(successResponse(result), HTTP_STATUS.OK);
  });

  return routes;
};

export { createAuthUsernameRoutes as authUsernameRoutes };

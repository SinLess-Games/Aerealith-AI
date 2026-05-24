import { Hono } from 'hono';

import { AuthError } from '@aerealith-ai/api';
import { AuthSessionSchemas } from '@aerealith-ai/contracts';

import type { AuthService } from '../services/auth.service';
import { requireUsernameAuthMiddleware } from '../middleware/require-auth.middleware';
import {
  getAuthContext,
  isAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
} from '../types/auth-context.type';

export type AuthSessionRoutesOptions = {
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

type ListSessionsQueryParseResult =
  | {
      success: true;
      data: AuthSessionSchemas.AuthListSessionsQuery;
    }
  | {
      success: false;
      response: ApiValidationErrorResponse;
    };

const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
} as const;

const USERNAME_PARAM = 'username';
const SESSION_ID_PARAM = 'sessionId';

const successResponse = <TData>(data: TData): ApiSuccessResponse<TData> => {
  return {
    success: true,
    data,
  };
};

const validationErrorResponse = (
  message: string,
  details?: unknown,
): ApiValidationErrorResponse => {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
};

const getAuthenticatedUsername = (context: AuthContextHonoContext): string => {
  const auth = getAuthContext(context);

  if (!isAuthenticatedAuthContext(auth)) {
    throw AuthError.unauthorized();
  }

  return auth.user.username;
};

const parseUsernameParam = (context: AuthContextHonoContext): string => {
  const username = context.req.param(USERNAME_PARAM);

  const parsed = AuthSessionSchemas.authUsernameParamsSchema.safeParse({
    username,
  });

  if (!parsed.success) {
    throw AuthError.userNotFound(username);
  }

  return parsed.data.username;
};

const parseSessionParams = (
  context: AuthContextHonoContext,
): AuthSessionSchemas.AuthSessionParams => {
  const username = context.req.param(USERNAME_PARAM);
  const sessionId = context.req.param(SESSION_ID_PARAM);

  const parsed = AuthSessionSchemas.authSessionParamsSchema.safeParse({
    username,
    sessionId,
  });

  if (!parsed.success) {
    throw AuthError.sessionNotFound();
  }

  return parsed.data;
};

const parseListSessionsQuery = (
  context: AuthContextHonoContext,
): ListSessionsQueryParseResult => {
  const parsed = AuthSessionSchemas.authListSessionsQuerySchema.safeParse(
    context.req.query(),
  );

  if (!parsed.success) {
    return {
      success: false,
      response: validationErrorResponse('Session list query is invalid.', {
        issues: parsed.error.issues,
      }),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
};

export const createAuthSessionRoutes = ({
  authService,
}: AuthSessionRoutesOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  routes.get(
    `/:${USERNAME_PARAM}/sessions`,
    requireUsernameAuthMiddleware({
      usernameParamName: USERNAME_PARAM,
    }),
    async (c) => {
      const context = c as AuthContextHonoContext;
      const queryResult = parseListSessionsQuery(context);

      if (!queryResult.success) {
        return c.json(queryResult.response, HTTP_STATUS.BAD_REQUEST);
      }

      const result = await authService.listSessionsForUsername(
        getAuthenticatedUsername(context),
        parseUsernameParam(context),
        queryResult.data,
      );

      return c.json(successResponse(result), HTTP_STATUS.OK);
    },
  );

  routes.delete(
    `/:${USERNAME_PARAM}/sessions/:${SESSION_ID_PARAM}`,
    requireUsernameAuthMiddleware({
      usernameParamName: USERNAME_PARAM,
    }),
    async (c) => {
      const context = c as AuthContextHonoContext;
      const params = parseSessionParams(context);

      const result = await authService.revokeSessionForUsername(
        getAuthenticatedUsername(context),
        params.username,
        params.sessionId,
      );

      return c.json(successResponse(result), HTTP_STATUS.OK);
    },
  );

  return routes;
};

export { createAuthSessionRoutes as authSessionRoutes };

import { Hono } from 'hono';

import { AuthError } from '@aerealith-ai/api';
import { AuthPasswordSchemas } from '@aerealith-ai/contracts';

import type { AuthService } from '../services/auth.service';
import { requireUsernameAuthMiddleware } from '../middleware/require-auth.middleware';
import {
  getAuthContext,
  isAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
} from '../types/auth-context.type';

export type AuthPasswordRoutesOptions = {
  authService: AuthService;
};

export type ApiSuccessResponse<TData> = {
  success: true;
  data: TData;
};

export type ApiValidationErrorResponse = {
  success: false;
  error: {
    code: 'VALIDATION_ERROR' | 'INVALID_JSON';
    message: string;
    details?: unknown;
  };
};

type BodyParseResult =
  | {
      success: true;
      data: unknown;
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

const invalidJsonResponse = (): ApiValidationErrorResponse => {
  return {
    success: false,
    error: {
      code: 'INVALID_JSON',
      message: 'Request body must be valid JSON.',
    },
  };
};

const readRequiredJsonBody = async (
  context: AuthContextHonoContext,
): Promise<BodyParseResult> => {
  try {
    const data = await context.req.json();

    return {
      success: true,
      data,
    };
  } catch {
    return {
      success: false,
      response: invalidJsonResponse(),
    };
  }
};

const getAuthenticatedUsername = (context: AuthContextHonoContext): string => {
  const auth = getAuthContext(context);

  if (!isAuthenticatedAuthContext(auth)) {
    throw AuthError.unauthorized();
  }

  return auth.user.username;
};

const getRequestedUsername = (context: AuthContextHonoContext): string => {
  const username = context.req.param(USERNAME_PARAM)?.trim();

  if (username === undefined || username === '') {
    throw AuthError.userNotFound(username);
  }

  return username;
};

export const createAuthPasswordRoutes = ({
  authService,
}: AuthPasswordRoutesOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  routes.patch(
    `/:${USERNAME_PARAM}/password`,
    requireUsernameAuthMiddleware({
      usernameParamName: USERNAME_PARAM,
    }),
    async (c) => {
      const context = c as AuthContextHonoContext;
      const bodyResult = await readRequiredJsonBody(context);

      if (!bodyResult.success) {
        return c.json(bodyResult.response, HTTP_STATUS.BAD_REQUEST);
      }

      const parsed = AuthPasswordSchemas.authPasswordChangeSchema.safeParse(
        bodyResult.data,
      );

      if (!parsed.success) {
        return c.json(
          validationErrorResponse('Password change request is invalid.', {
            issues: parsed.error.issues,
          }),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const result = await authService.changePassword(
        getAuthenticatedUsername(context),
        getRequestedUsername(context),
        parsed.data,
      );

      return c.json(successResponse(result), HTTP_STATUS.OK);
    },
  );

  routes.post('/password/reset-token', async (c) => {
    const context = c as AuthContextHonoContext;
    const bodyResult = await readRequiredJsonBody(context);

    if (!bodyResult.success) {
      return c.json(bodyResult.response, HTTP_STATUS.BAD_REQUEST);
    }

    const parsed = AuthPasswordSchemas.authPasswordResetTokenSchema.safeParse(
      bodyResult.data,
    );

    if (!parsed.success) {
      return c.json(
        validationErrorResponse('Password reset token request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.createPasswordResetToken(parsed.data);

    return c.json(successResponse(result.response), HTTP_STATUS.OK);
  });

  routes.post('/password/reset', async (c) => {
    const context = c as AuthContextHonoContext;
    const bodyResult = await readRequiredJsonBody(context);

    if (!bodyResult.success) {
      return c.json(bodyResult.response, HTTP_STATUS.BAD_REQUEST);
    }

    const parsed = AuthPasswordSchemas.authPasswordResetSchema.safeParse(
      bodyResult.data,
    );

    if (!parsed.success) {
      return c.json(
        validationErrorResponse('Password reset request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.resetPassword(parsed.data);

    return c.json(successResponse(result), HTTP_STATUS.OK);
  });

  return routes;
};

export { createAuthPasswordRoutes as authPasswordRoutes };

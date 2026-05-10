import { Hono } from 'hono';

import { AuthError } from '@helix-ai/api';
import { AuthVerificationSchemas } from '@helix-ai/contracts';

import type { AuthService } from '../services/auth.service';
import { requireUsernameAuthMiddleware } from '../middleware/require-auth.middleware';
import {
  getAuthContext,
  isAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
} from '../types/auth-context.type';

export type AuthEmailVerificationRoutesOptions = {
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

const readOptionalJsonBody = async (
  context: AuthContextHonoContext,
): Promise<BodyParseResult> => {
  const contentLength = context.req.header('Content-Length');
  const contentType = context.req.header('Content-Type');

  const hasJsonBody =
    contentLength !== undefined ||
    contentType?.toLowerCase().includes('application/json') === true;

  if (!hasJsonBody) {
    return {
      success: true,
      data: {},
    };
  }

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

const parseUsernameParam = (context: AuthContextHonoContext): string => {
  const username = context.req.param(USERNAME_PARAM);

  const parsed = AuthVerificationSchemas.authVerificationParamsSchema.safeParse(
    {
      username,
    },
  );

  if (!parsed.success) {
    throw AuthError.userNotFound(username);
  }

  return parsed.data.username;
};

export const createAuthEmailVerificationRoutes = ({
  authService,
}: AuthEmailVerificationRoutesOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  routes.post(
    `/:${USERNAME_PARAM}/email/verification-token`,
    requireUsernameAuthMiddleware({
      usernameParamName: USERNAME_PARAM,
    }),
    async (c) => {
      const context = c as AuthContextHonoContext;
      const bodyResult = await readOptionalJsonBody(context);

      if (!bodyResult.success) {
        return c.json(bodyResult.response, HTTP_STATUS.BAD_REQUEST);
      }

      const parsed =
        AuthVerificationSchemas.authCreateEmailVerificationTokenSchema.safeParse(
          bodyResult.data,
        );

      if (!parsed.success) {
        return c.json(
          validationErrorResponse(
            'Email verification token request is invalid.',
            {
              issues: parsed.error.issues,
            },
          ),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const result = await authService.createEmailVerificationToken(
        getAuthenticatedUsername(context),
        parseUsernameParam(context),
        parsed.data,
      );

      return c.json(successResponse(result.response), HTTP_STATUS.OK);
    },
  );

  routes.post(
    `/:${USERNAME_PARAM}/email/verify`,
    requireUsernameAuthMiddleware({
      usernameParamName: USERNAME_PARAM,
    }),
    async (c) => {
      const context = c as AuthContextHonoContext;
      const bodyResult = await readRequiredJsonBody(context);

      if (!bodyResult.success) {
        return c.json(bodyResult.response, HTTP_STATUS.BAD_REQUEST);
      }

      const parsed = AuthVerificationSchemas.authVerifyEmailSchema.safeParse(
        bodyResult.data,
      );

      if (!parsed.success) {
        return c.json(
          validationErrorResponse('Email verification request is invalid.', {
            issues: parsed.error.issues,
          }),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const result = await authService.verifyEmail(
        getAuthenticatedUsername(context),
        parseUsernameParam(context),
        parsed.data,
      );

      return c.json(successResponse(result), HTTP_STATUS.OK);
    },
  );

  return routes;
};

export { createAuthEmailVerificationRoutes as authEmailVerificationRoutes };

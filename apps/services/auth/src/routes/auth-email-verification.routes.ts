import { Hono } from 'hono';
import type { Context } from 'hono';

import { AuthError } from '@aerealith-ai/api';
import { AuthVerificationSchemas } from '@aerealith-ai/contracts';

import type { AuthService } from '../services/auth.service';
import { requireUsernameAuthMiddleware } from '../middleware/require-auth.middleware';
import {
  getAuthContext,
  isAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthHonoEnv,
} from '../types/auth-context.type';

type EmailVerificationTokenCreateResult = Awaited<
  ReturnType<AuthService['createEmailVerificationToken']>
>;

type EmailVerificationTokenForUserResult = Awaited<
  ReturnType<AuthService['createEmailVerificationTokenForUser']>
>;

export type AuthEmailVerificationMailInput = {
  user: EmailVerificationTokenForUserResult['user'];
  emailVerificationToken:
    | EmailVerificationTokenCreateResult
    | EmailVerificationTokenForUserResult['emailVerificationToken'];
  request: {
    origin?: string;
    userAgent?: string;
    ipAddress?: string;
  };
};

export type AuthEmailVerificationMailer = {
  sendEmailVerification: (
    input: AuthEmailVerificationMailInput,
  ) => Promise<void>;
};

export type AuthEmailVerificationRoutesOptions = {
  authService: AuthService;
  emailVerificationMailer?: AuthEmailVerificationMailer;
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

export type AuthResendEmailVerificationPublicResponse = {
  user: EmailVerificationTokenForUserResult['user'];
  verification: {
    required: true;
    emailSent: boolean;
    message: string;
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

type EmailVerificationLookupInput = {
  username?: string;
  email?: string;
};

type EmailVerificationLookupParseResult =
  | {
      success: true;
      data: EmailVerificationLookupInput;
    }
  | {
      success: false;
      response: ApiValidationErrorResponse;
    };

type HeaderContext = {
  req: {
    header: (name: string) => string | undefined;
  };
};

type JsonBodyContext = HeaderContext & {
  req: HeaderContext['req'] & {
    json: () => Promise<unknown>;
  };
};

const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
} as const;

const HEADER = {
  USER_AGENT: 'User-Agent',
  CF_CONNECTING_IP: 'CF-Connecting-IP',
  X_FORWARDED_FOR: 'X-Forwarded-For',
  X_REAL_IP: 'X-Real-IP',
  ORIGIN: 'Origin',
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

const readRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
};

const readStringProperty = (
  value: unknown,
  property: string,
): string | undefined => {
  const propertyValue = readRecord(value)[property];

  if (typeof propertyValue === 'string' && propertyValue.trim()) {
    return propertyValue.trim();
  }

  return undefined;
};

const getFirstForwardedIp = (value: string | undefined): string | undefined => {
  const firstIp = value?.split(',')[0]?.trim();

  if (!firstIp) {
    return undefined;
  }

  return firstIp;
};

const getRequestMetadata = (context: HeaderContext) => {
  return {
    userAgent: context.req.header(HEADER.USER_AGENT),
    ipAddress:
      context.req.header(HEADER.CF_CONNECTING_IP) ??
      getFirstForwardedIp(context.req.header(HEADER.X_FORWARDED_FOR)) ??
      context.req.header(HEADER.X_REAL_IP),
  };
};

const getRequestOrigin = (context: HeaderContext): string | undefined => {
  return context.req.header(HEADER.ORIGIN);
};

const createEmailVerificationMailRequest = (
  context: HeaderContext,
): AuthEmailVerificationMailInput['request'] => {
  const metadata = getRequestMetadata(context);
  const origin = getRequestOrigin(context);

  return {
    ...(origin === undefined ? {} : { origin }),
    ...(metadata.userAgent === undefined
      ? {}
      : { userAgent: metadata.userAgent }),
    ...(metadata.ipAddress === undefined
      ? {}
      : { ipAddress: metadata.ipAddress }),
  };
};

const readOptionalJsonBody = async (
  context: JsonBodyContext,
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
  context: JsonBodyContext,
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

const getVerificationTokenResponse = (
  result: EmailVerificationTokenCreateResult,
): unknown => {
  const response = readRecord(result).response;

  return response ?? result;
};

const parseEmailVerificationLookupInput = (
  value: unknown,
): EmailVerificationLookupParseResult => {
  const username = readStringProperty(value, 'username');
  const email = readStringProperty(value, 'email');

  if (username === undefined && email === undefined) {
    return {
      success: false,
      response: validationErrorResponse(
        'Email verification resend request is invalid.',
        {
          issues: [
            {
              code: 'custom',
              path: ['username'],
              message: 'Username or email is required.',
            },
          ],
        },
      ),
    };
  }

  return {
    success: true,
    data: {
      ...(username === undefined ? {} : { username }),
      ...(email === undefined ? {} : { email }),
    },
  };
};

const createResendPublicResponse = (
  result: EmailVerificationTokenForUserResult,
  emailSent: boolean,
): AuthResendEmailVerificationPublicResponse => {
  return {
    user: result.user,
    verification: {
      required: true,
      emailSent,
      message: emailSent
        ? 'Verification email sent. Check your email to verify your account.'
        : 'Verification token created, but the verification email could not be sent.',
    },
  };
};

const logEmailVerificationDeliveryFailure = (
  error: unknown,
  context: { operation: string; username: string },
): void => {
  const errorPayload =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
        }
      : {
          message: String(error),
        };

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Email verification delivery failed.',
      operation: context.operation,
      username: context.username,
      error: errorPayload,
    }),
  );
};

export const createAuthEmailVerificationRoutes = ({
  authService,
  emailVerificationMailer,
}: AuthEmailVerificationRoutesOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  routes.get('/verify-email', async (c: Context<AuthHonoEnv>) => {
    const token = c.req.query('token');

    const parsed = AuthVerificationSchemas.authVerifyEmailSchema.safeParse({
      token,
    });

    if (!parsed.success) {
      return c.json(
        validationErrorResponse('Email verification request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.verifyEmailByToken(parsed.data);

    return c.json(successResponse(result), HTTP_STATUS.OK);
  });

  routes.post('/verify-email', async (c) => {
    const bodyResult = await readRequiredJsonBody(c);

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

    const result = await authService.verifyEmailByToken(parsed.data);

    return c.json(successResponse(result), HTTP_STATUS.OK);
  });

  routes.post('/resend-verification', async (c) => {
    const bodyResult = await readRequiredJsonBody(c);

    if (!bodyResult.success) {
      return c.json(bodyResult.response, HTTP_STATUS.BAD_REQUEST);
    }

    const parsed = parseEmailVerificationLookupInput(bodyResult.data);

    if (!parsed.success) {
      return c.json(parsed.response, HTTP_STATUS.BAD_REQUEST);
    }

    const result =
      await authService.createEmailVerificationTokenForUser(parsed.data);

    let emailSent = false;

    if (emailVerificationMailer !== undefined) {
      try {
        await emailVerificationMailer.sendEmailVerification({
          user: result.user,
          emailVerificationToken: result.emailVerificationToken,
          request: createEmailVerificationMailRequest(c),
        });

        emailSent = true;
      } catch (error) {
        logEmailVerificationDeliveryFailure(error, {
          operation: 'resend-verification',
          username: result.user.username,
        });
      }
    }

    return c.json(
      successResponse(createResendPublicResponse(result, emailSent)),
      HTTP_STATUS.OK,
    );
  });

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

      return c.json(
        successResponse(getVerificationTokenResponse(result)),
        HTTP_STATUS.OK,
      );
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

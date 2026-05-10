import { Hono } from 'hono';

import {
  AuthLoginSchemas,
  AuthRegisterSchemas,
  AuthSessionSchemas,
} from '@helix-ai/contracts';

import type { AuthService } from '../services/auth.service';
import type { AuthHonoEnv } from '../types/auth-context.type';

export type AuthPublicRoutesOptions = {
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

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
} as const;

const HEADER = {
  USER_AGENT: 'User-Agent',
  CF_CONNECTING_IP: 'CF-Connecting-IP',
  X_FORWARDED_FOR: 'X-Forwarded-For',
  X_REAL_IP: 'X-Real-IP',
} as const;

const getFirstForwardedIp = (value: string | undefined): string | undefined => {
  const firstIp = value?.split(',')[0]?.trim();

  if (!firstIp) {
    return undefined;
  }

  return firstIp;
};

const getRequestMetadata = (c: {
  req: {
    header: (name: string) => string | undefined;
  };
}) => {
  return {
    userAgent: c.req.header(HEADER.USER_AGENT),
    ipAddress:
      c.req.header(HEADER.CF_CONNECTING_IP) ??
      getFirstForwardedIp(c.req.header(HEADER.X_FORWARDED_FOR)) ??
      c.req.header(HEADER.X_REAL_IP),
  };
};

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

const readJsonBody = async (c: {
  req: {
    json: () => Promise<unknown>;
  };
}): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
};

export const createAuthPublicRoutes = ({
  authService,
}: AuthPublicRoutesOptions): Hono<AuthHonoEnv> => {
  const routes = new Hono<AuthHonoEnv>();

  routes.post('/register', async (c) => {
    const body = await readJsonBody(c);

    if (body === undefined) {
      return c.json(invalidJsonResponse(), HTTP_STATUS.BAD_REQUEST);
    }

    const parsed = AuthRegisterSchemas.authRegisterSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        validationErrorResponse('Registration request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.register(
      parsed.data,
      getRequestMetadata(c),
    );

    return c.json(successResponse(result), HTTP_STATUS.CREATED);
  });

  routes.post('/login', async (c) => {
    const body = await readJsonBody(c);

    if (body === undefined) {
      return c.json(invalidJsonResponse(), HTTP_STATUS.BAD_REQUEST);
    }

    const parsed = AuthLoginSchemas.authLoginSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        validationErrorResponse('Login request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.login(parsed.data, getRequestMetadata(c));

    return c.json(successResponse(result), HTTP_STATUS.OK);
  });

  routes.post('/refresh', async (c) => {
    const body = await readJsonBody(c);

    if (body === undefined) {
      return c.json(invalidJsonResponse(), HTTP_STATUS.BAD_REQUEST);
    }

    const parsed = AuthSessionSchemas.authRefreshSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        validationErrorResponse('Refresh request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.refresh(
      parsed.data,
      getRequestMetadata(c),
    );

    return c.json(successResponse(result), HTTP_STATUS.OK);
  });

  routes.post('/logout', async (c) => {
    const body = await readJsonBody(c);

    if (body === undefined) {
      return c.json(invalidJsonResponse(), HTTP_STATUS.BAD_REQUEST);
    }

    const parsed = AuthSessionSchemas.authLogoutSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        validationErrorResponse('Logout request is invalid.', {
          issues: parsed.error.issues,
        }),
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await authService.logout(parsed.data);

    return c.json(successResponse(result), HTTP_STATUS.OK);
  });

  return routes;
};

export { createAuthPublicRoutes as authPublicRoutes };

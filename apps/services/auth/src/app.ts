import { Hono } from 'hono';

import {
  flagBoolean,
  honoFlagMiddleware,
} from '@aerealith-ai/flags';
import {
  ERROR_RESPONSE_HEADER,
  createErrorResponseBody,
  honoCorsMiddleware,
  honoErrorMiddleware,
  honoRequestIdMiddleware,
  honoStructuredLoggerMiddleware,
} from '@aerealith-ai/api';
import { createLogger, type ObservabilityLogger } from '@aerealith-ai/observability';
import { createHonoTraceMiddleware } from '@aerealith-ai/observability';

import type { AuthContextMiddlewareOptions } from './middleware/auth-context.middleware';
import { createAuthRoutes } from './routes';
import type { AuthRoutesEmailVerificationMailer } from './routes';
import type { AuthService } from './services/auth.service';
import type { AuthHonoEnv } from './types/auth-context.type';

export type AuthAppOptions = {
  authService: AuthService;
  authContext: Omit<AuthContextMiddlewareOptions, 'requireSession'>;
  emailVerificationMailer?: AuthRoutesEmailVerificationMailer;
  logger?: ObservabilityLogger;
  serviceName?: string;
  version?: string;
};

export type HealthResponse = {
  success: true;
  data: {
    service: string;
    status: 'ok';
    version: string;
    timestamp: string;
  };
};

export type ReadinessResponse = {
  success: true;
  data: {
    service: string;
    ready: true;
    timestamp: string;
  };
};

const DEFAULT_SERVICE_NAME = 'aerealith-auth-service';
const DEFAULT_VERSION = '0.0.1';

const HTTP_STATUS = {
  OK: 200,
  NOT_FOUND: 404,
} as const;

const successResponse = <TData>(data: TData) => {
  return {
    success: true,
    data,
  };
};

export const createAuthApp = ({
  authService,
  authContext,
  emailVerificationMailer,
  logger = createLogger({ service: DEFAULT_SERVICE_NAME }),
  serviceName = DEFAULT_SERVICE_NAME,
  version = DEFAULT_VERSION,
}: AuthAppOptions): Hono<AuthHonoEnv> => {
  const app = new Hono<AuthHonoEnv>();

  app.use('*', honoFlagMiddleware({ failOpen: true }));

  const emailVerificationMailerOptions =
    emailVerificationMailer === undefined ? {} : { emailVerificationMailer };

  app.use('*', honoRequestIdMiddleware());
  app.use('*', honoErrorMiddleware());
  app.use('*', createHonoTraceMiddleware({ service: serviceName }));
  app.use('*', honoStructuredLoggerMiddleware());
  app.use('*', honoCorsMiddleware());
  app.use('*', async (context, next) => {
    const maintenanceMode = await flagBoolean(
      context,
      'maintenance-mode',
      false,
    );

    if (maintenanceMode && !['/', '/health', '/ready'].includes(context.req.path)) {
      return context.json(
        {
          success: false,
          error: {
            code: 'MAINTENANCE_MODE',
            message: 'The auth service is temporarily unavailable.',
          },
        },
        503,
      );
    }

    const startedAt = Date.now();

    try {
      await next();
    } finally {
      logger.info('Auth request completed', {
        success: context.res.ok,
        failed: !context.res.ok,
        metadata: {
          method: context.req.method,
          path: context.req.path,
          status: context.res.status,
          durationMs: Date.now() - startedAt,
        },
        tags: [context.res.ok ? 'success' : 'failed'],
      });
    }
  });

  app.onError((error, c) => {
    logger.error('Auth request failed', {
      error,
      metadata: {
        method: c.req.method,
        path: c.req.path,
      },
      tags: ['failed'],
    });

    const body = createErrorResponseBody(c, error);
    const status =
      typeof error.status === 'number' &&
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : typeof error.statusCode === 'number' &&
            Number.isInteger(error.statusCode) &&
            error.statusCode >= 400 &&
            error.statusCode <= 599
          ? error.statusCode
          : 500;

    return c.json(body, {
      status,
      headers: {
        [ERROR_RESPONSE_HEADER]: body.error.code,
      },
    });
  });

  app.get('/', (c) => {
    return c.json(
      successResponse({
        service: serviceName,
        status: 'ok',
        version,
        timestamp: new Date().toISOString(),
      }),
      HTTP_STATUS.OK,
    );
  });

  app.get('/health', (c) => {
    return c.json(
      successResponse({
        service: serviceName,
        status: 'ok',
        version,
        timestamp: new Date().toISOString(),
      }),
      HTTP_STATUS.OK,
    );
  });

  app.get('/ready', (c) => {
    return c.json(
      successResponse({
        service: serviceName,
        ready: true,
        timestamp: new Date().toISOString(),
      }),
      HTTP_STATUS.OK,
    );
  });

  app.route(
    '/auth',
    createAuthRoutes({
      authService,
      authContext,
      ...emailVerificationMailerOptions,
    }),
  );

  app.notFound((c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found.',
        },
      },
      HTTP_STATUS.NOT_FOUND,
    );
  });

  return app;
};

export { createAuthApp as createApp };

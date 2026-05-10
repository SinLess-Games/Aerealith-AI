import { Hono } from 'hono';

import {
  honoCorsMiddleware,
  honoErrorMiddleware,
  honoRequestIdMiddleware,
  honoStructuredLoggerMiddleware,
} from '@helix-ai/api';

import type { AuthService } from './services/auth.service';
import type { AuthContextMiddlewareOptions } from './middleware/auth-context.middleware';
import type { AuthHonoEnv } from './types/auth-context.type';
import { createAuthRoutes } from './routes';

export type AuthAppOptions = {
  authService: AuthService;
  authContext: Omit<AuthContextMiddlewareOptions, 'requireSession'>;
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

const DEFAULT_SERVICE_NAME = 'helix-auth-service';
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
  serviceName = DEFAULT_SERVICE_NAME,
  version = DEFAULT_VERSION,
}: AuthAppOptions): Hono<AuthHonoEnv> => {
  const app = new Hono<AuthHonoEnv>();

  app.use('*', honoRequestIdMiddleware());
  app.use('*', honoErrorMiddleware());
  app.use('*', honoStructuredLoggerMiddleware());
  app.use('*', honoCorsMiddleware());

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

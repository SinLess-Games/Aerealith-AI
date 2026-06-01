import { Hono } from 'hono';

import { flagBoolean, honoFlagMiddleware } from '@aerealith-ai/flags';
import {
  createHonoTraceMiddleware,
  createLogger,
} from '@aerealith-ai/observability';

import { v1Router, type V1RouterEnv } from './routes';
import type { UserServiceContextEnv } from './users/types';

export type UserServiceAppEnv = {
  Bindings: UserServiceContextEnv;
  Variables: V1RouterEnv['Variables'];
};

const getLoggerEnv = (env: UserServiceContextEnv) => ({
  NODE_ENV: env.NODE_ENV,
  SERVICE_NAME: env.SERVICE_NAME,
  LOKI_API_TOKEN: env.LOKI_API_TOKEN,
  TEMPO_API_TOKEN: env.TEMPO_API_TOKEN,
});

export const app = new Hono<UserServiceAppEnv>();

app.use('*', honoFlagMiddleware({ failOpen: true }));
app.use('*', createHonoTraceMiddleware({ service: 'aerealith-user-service' }));

app.get('/', (context) =>
  context.json({
    ok: true,
    service: context.env?.SERVICE_NAME ?? 'aerealith-user-service',
    status: 'running',
    routes: {
      health: '/api/V1/users/health',
      users: '/api/V1/users',
    },
    timestamp: new Date().toISOString(),
  }),
);

app.use('*', async (context, next) => {
  const maintenanceMode = await flagBoolean(
    context as unknown as Parameters<typeof flagBoolean>[0],
    'maintenance-mode',
    false,
  );

  if (maintenanceMode && context.req.path !== '/health') {
    return context.json(
      {
        ok: false,
        error: {
          code: 'MAINTENANCE_MODE',
          message: 'The user service is temporarily unavailable.',
        },
      },
      503,
    );
  }

  const logger = createLogger({
    service: context.env?.SERVICE_NAME ?? 'aerealith-user-service',
    env: getLoggerEnv(context.env),
  });
  const startedAt = Date.now();

  try {
    await next();
    return context.res;
  } finally {
    logger.info('User request completed', {
      success: context.res.ok,
      failed: !context.res.ok,
      tags: [context.res.ok ? 'success' : 'failed'],
      metadata: {
        method: context.req.method,
        path: context.req.path,
        status: context.res.status,
        durationMs: Date.now() - startedAt,
      },
    });
  }
});

/**
 * Canonical user service route mount.
 *
 * Final route contract:
 * GET    /api/V1/users/health
 * GET    /api/V1/users
 * POST   /api/V1/users
 * GET    /api/V1/users/:username
 * PATCH  /api/V1/users/:username
 * DELETE /api/V1/users/:username
 * GET    /api/V1/users/:username/profile
 * GET    /api/V1/users/:username/settings
 */
app.route('/api/V1', v1Router);

app.notFound((context) =>
  context.json(
    {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
    },
    404,
  ),
);

app.onError((error, context) => {
  createLogger({
    service: context.env?.SERVICE_NAME ?? 'aerealith-user-service',
    env: getLoggerEnv(context.env),
  }).error('User request failed', {
    error,
    tags: ['failed'],
    metadata: {
      method: context.req.method,
      path: context.req.path,
    },
  });

  return context.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    },
    500,
  );
});

export default app;

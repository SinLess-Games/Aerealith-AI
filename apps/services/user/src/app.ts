import { Hono } from 'hono';

import { v1Router, type V1RouterEnv } from './routes';
import type { UserServiceContextEnv } from './users/types';

export type UserServiceAppEnv = {
  Bindings: UserServiceContextEnv;
  Variables: V1RouterEnv['Variables'];
};

export const app = new Hono<UserServiceAppEnv>();

app.get('/', (context) =>
  context.json({
    ok: true,
    service: context.env?.SERVICE_NAME ?? 'helix-user-service',
    status: 'running',
    routes: {
      health: '/api/V1/users/health',
      users: '/api/V1/users',
    },
    timestamp: new Date().toISOString(),
  }),
);

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
  console.error(error);

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
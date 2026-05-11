import { Hono } from 'hono';

import { usersRouter, type UsersRouterEnv } from '../users/users.router';

export type V1RouterEnv = UsersRouterEnv;

export const v1Router = new Hono<V1RouterEnv>();

/**
 * User service V1 routes.
 *
 * Mounted by the app at:
 * /api/V1
 *
 * Final routes:
 * GET    /api/V1/users/health
 * GET    /api/V1/users
 * POST   /api/V1/users
 * GET    /api/V1/users/:username
 * PATCH  /api/V1/users/:username
 * DELETE /api/V1/users/:username
 * GET    /api/V1/users/:username/profile
 * GET    /api/V1/users/:username/settings
 */
v1Router.route('/users', usersRouter);

export default v1Router;
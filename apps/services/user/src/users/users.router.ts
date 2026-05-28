import { Hono } from 'hono';

import { flagBoolean } from '@aerealith-ai/flags';
import type { UserContextVariables } from './types';

import {
  createUserController,
  deleteUserController,
  getUserController,
  getUserProfileController,
  getUserSettingsController,
  listUsersController,
  updateUserController,
  updateUserProfileController,
  updateUserSettingsController,
} from './controllers';

export type UsersRouterEnv = {
  Bindings: {
    AUTH_SERVICE?: Fetcher;
  };
  Variables: UserContextVariables;
};

const disabledResponse = (message: string) => ({
  ok: false,
  error: {
    code: 'FEATURE_DISABLED',
    message,
  },
});

export const usersRouter = new Hono<UsersRouterEnv>();

/**
 * Route order matters.
 *
 * Keep /health before /:username so "health" is not treated as a username.
 */
usersRouter.get('/health', async (context) => {
  const authService = context.env?.AUTH_SERVICE;
  const auth = {
    binding: 'AUTH_SERVICE',
    connected: false,
    status: 'missing',
  };

  if (authService) {
    try {
      const response = await authService.fetch('http://auth.local/health');

      auth.connected = response.ok;
      auth.status = response.ok ? 'healthy' : 'unhealthy';
    } catch {
      auth.status = 'unreachable';
    }
  }

  return context.json({
    ok: true,
    service: 'aerealith-user-service',
    status: auth.connected ? 'healthy' : 'degraded',
    dependencies: {
      auth,
    },
    timestamp: new Date().toISOString(),
  });
});

usersRouter.get('/', async (context, next) => {
  if (!(await flagBoolean(context, 'dashboard', false))) {
    return context.json(disabledResponse('Dashboard access is disabled.'), 404);
  }

  await next();
}, listUsersController);

usersRouter.post('/', async (context, next) => {
  if (!(await flagBoolean(context, 'onboarding', false))) {
    return context.json(disabledResponse('Onboarding is disabled.'), 404);
  }

  await next();
}, createUserController);

usersRouter.get('/:username', async (context, next) => {
  if (!(await flagBoolean(context, 'dashboard', false))) {
    return context.json(disabledResponse('Dashboard access is disabled.'), 404);
  }

  await next();
}, getUserController);

usersRouter.patch('/:username', async (context, next) => {
  if (!(await flagBoolean(context, 'onboarding', false))) {
    return context.json(disabledResponse('Onboarding updates are disabled.'), 404);
  }

  await next();
}, updateUserController);

usersRouter.delete('/:username', async (context, next) => {
  if (!(await flagBoolean(context, 'billing', false))) {
    return context.json(disabledResponse('Billing-related account actions are disabled.'), 404);
  }

  await next();
}, deleteUserController);

usersRouter.get('/:username/profile', async (context, next) => {
  if (!(await flagBoolean(context, 'dashboard', false))) {
    return context.json(disabledResponse('Dashboard access is disabled.'), 404);
  }

  await next();
}, getUserProfileController);

usersRouter.patch('/:username/profile', async (context, next) => {
  if (!(await flagBoolean(context, 'onboarding', false))) {
    return context.json(disabledResponse('Onboarding updates are disabled.'), 404);
  }

  await next();
}, updateUserProfileController);

usersRouter.get('/:username/settings', async (context, next) => {
  if (!(await flagBoolean(context, 'billing', false))) {
    return context.json(disabledResponse('Billing settings are disabled.'), 404);
  }

  await next();
}, getUserSettingsController);

usersRouter.patch('/:username/settings', async (context, next) => {
  if (!(await flagBoolean(context, 'billing', false))) {
    return context.json(disabledResponse('Billing settings are disabled.'), 404);
  }

  await next();
}, updateUserSettingsController);

export default usersRouter;

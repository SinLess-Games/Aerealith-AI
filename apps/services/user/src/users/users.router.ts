import { Hono } from 'hono';
import type { Context } from 'hono';

import { flagBoolean } from '@aerealith-ai/flags';
import type { UserContextVariables } from './types';

import {
  createUserController,
  deleteUserController,
  getPrivateProfileDashboardController,
  getPublicProfileController,
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

const isEnabled = (
  context: Context<UsersRouterEnv>,
  key: string,
  defaultValue: boolean,
): Promise<boolean> =>
  flagBoolean(
    context as unknown as Parameters<typeof flagBoolean>[0],
    key,
    defaultValue,
  );

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

usersRouter.get(
  '/',
  async (context, next) => {
    if (!(await isEnabled(context, 'dashboard', false))) {
      return context.json(
        disabledResponse('Dashboard access is disabled.'),
        404,
      );
    }

    return next();
  },
  listUsersController,
);

usersRouter.post(
  '/',
  async (context, next) => {
    if (!(await isEnabled(context, 'onboarding', false))) {
      return context.json(disabledResponse('Onboarding is disabled.'), 404);
    }

    return next();
  },
  createUserController,
);

usersRouter.get(
  '/:username',
  async (context, next) => {
    if (!(await isEnabled(context, 'dashboard', false))) {
      return context.json(
        disabledResponse('Dashboard access is disabled.'),
        404,
      );
    }

    return next();
  },
  getUserController,
);

usersRouter.patch(
  '/:username',
  async (context, next) => {
    if (!(await isEnabled(context, 'onboarding', false))) {
      return context.json(
        disabledResponse('Onboarding updates are disabled.'),
        404,
      );
    }

    return next();
  },
  updateUserController,
);

usersRouter.delete(
  '/:username',
  async (context, next) => {
    if (!(await isEnabled(context, 'billing', false))) {
      return context.json(
        disabledResponse('Billing-related account actions are disabled.'),
        404,
      );
    }

    return next();
  },
  deleteUserController,
);

usersRouter.get(
  '/:username/profile',
  async (context, next) => {
    if (!(await isEnabled(context, 'profile-public', true))) {
      return context.json(
        disabledResponse('Public profiles are disabled.'),
        404,
      );
    }

    return next();
  },
  getPublicProfileController,
);

usersRouter.get(
  '/:username/profile/dashboard',
  async (context, next) => {
    if (!(await isEnabled(context, 'profile-private', true))) {
      return context.json(
        disabledResponse('Private profiles are disabled.'),
        404,
      );
    }

    return next();
  },
  getPrivateProfileDashboardController,
);

usersRouter.get(
  '/:username/profile/basic',
  async (context, next) => {
    if (!(await isEnabled(context, 'dashboard', false))) {
      return context.json(
        disabledResponse('Dashboard access is disabled.'),
        404,
      );
    }

    return next();
  },
  getUserProfileController,
);

usersRouter.patch(
  '/:username/profile',
  async (context, next) => {
    if (!(await isEnabled(context, 'profile-private', true))) {
      return context.json(
        disabledResponse('Profile updates are disabled.'),
        404,
      );
    }

    return next();
  },
  updateUserProfileController,
);

usersRouter.get(
  '/:username/settings',
  async (context, next) => {
    if (!(await isEnabled(context, 'billing', false))) {
      return context.json(
        disabledResponse('Billing settings are disabled.'),
        404,
      );
    }

    return next();
  },
  getUserSettingsController,
);

usersRouter.patch(
  '/:username/settings',
  async (context, next) => {
    if (!(await isEnabled(context, 'billing', false))) {
      return context.json(
        disabledResponse('Billing settings are disabled.'),
        404,
      );
    }

    return next();
  },
  updateUserSettingsController,
);

export default usersRouter;

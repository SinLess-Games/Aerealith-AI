import { Hono } from 'hono';

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
    service: 'helix-user-service',
    status: auth.connected ? 'healthy' : 'degraded',
    dependencies: {
      auth,
    },
    timestamp: new Date().toISOString(),
  });
});

usersRouter.get('/', listUsersController);

usersRouter.post('/', createUserController);

usersRouter.get('/:username', getUserController);

usersRouter.patch('/:username', updateUserController);

usersRouter.delete('/:username', deleteUserController);

usersRouter.get('/:username/profile', getUserProfileController);
usersRouter.patch('/:username/profile', updateUserProfileController);

usersRouter.get('/:username/settings', getUserSettingsController);
usersRouter.patch('/:username/settings', updateUserSettingsController);

export default usersRouter;

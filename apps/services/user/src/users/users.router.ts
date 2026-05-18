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
  Variables: UserContextVariables;
};

export const usersRouter = new Hono<UsersRouterEnv>();

/**
 * Route order matters.
 *
 * Keep /health before /:username so "health" is not treated as a username.
 */
usersRouter.get('/health', (context) =>
  context.json({
    ok: true,
    service: 'helix-user-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }),
);

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

import { Hono, type Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./controllers', () => {
  const controller =
    (name: string) =>
    (context: Context): Response =>
      context.json({
        ok: true,
        data: {
          controller: name,
        },
      });

  return {
    createUserController: controller('createUserController'),
    deleteUserController: controller('deleteUserController'),
    getUserController: controller('getUserController'),
    getUserProfileController: controller('getUserProfileController'),
    getUserSettingsController: controller('getUserSettingsController'),
    listUsersController: controller('listUsersController'),
    updateUserController: controller('updateUserController'),
    updateUserProfileController: controller('updateUserProfileController'),
    updateUserSettingsController: controller('updateUserSettingsController'),
  };
});

import { usersRouter } from './users.router';

interface HealthResponseBody {
  ok: true;
  service: string;
  status: 'healthy' | 'degraded';
  dependencies: {
    auth: {
      binding: 'AUTH_SERVICE';
      connected: boolean;
      status: string;
    };
  };
  timestamp: string;
}

interface MockControllerResponseBody {
  ok: true;
  data: {
    controller: string;
  };
}

describe('usersRouter', () => {
  it('returns the users health response', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request('/users/health');
    const body = (await response.json()) as HealthResponseBody;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      service: 'helix-user-service',
      status: 'degraded',
      dependencies: {
        auth: {
          binding: 'AUTH_SERVICE',
          connected: false,
          status: 'missing',
        },
      },
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('reports auth as connected when the service binding responds', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request(
      '/users/health',
      {},
      {
        AUTH_SERVICE: {
          fetch: vi.fn(async () => new Response('{}', { status: 200 })),
        },
      },
    );
    const body = (await response.json()) as HealthResponseBody;

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.dependencies.auth).toEqual({
      binding: 'AUTH_SERVICE',
      connected: true,
      status: 'healthy',
    });
  });

  it('routes GET /users to listUsersController', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request('/users');
    const body = (await response.json()) as MockControllerResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.controller).toBe('listUsersController');
  });

  it('routes POST /users to createUserController', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request('/users', {
      method: 'POST',
    });

    const body = (await response.json()) as MockControllerResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.controller).toBe('createUserController');
  });

  it('routes GET /users/:username to getUserController', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request('/users/sinless777');
    const body = (await response.json()) as MockControllerResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.controller).toBe('getUserController');
  });

  it('routes PATCH /users/:username to updateUserController', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request('/users/sinless777', {
      method: 'PATCH',
    });

    const body = (await response.json()) as MockControllerResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.controller).toBe('updateUserController');
  });

  it('routes DELETE /users/:username to deleteUserController', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request('/users/sinless777', {
      method: 'DELETE',
    });

    const body = (await response.json()) as MockControllerResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.controller).toBe('deleteUserController');
  });

  it('routes GET /users/:username/profile to getUserProfileController', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request('/users/sinless777/profile');
    const body = (await response.json()) as MockControllerResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.controller).toBe('getUserProfileController');
  });

  it('routes GET /users/:username/settings to getUserSettingsController', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request('/users/sinless777/settings');
    const body = (await response.json()) as MockControllerResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.controller).toBe('getUserSettingsController');
  });

  it('returns 404 for unknown nested routes', async () => {
    const app = new Hono();

    app.route('/users', usersRouter);

    const response = await app.request('/users/sinless777/unknown');

    expect(response.status).toBe(404);
  });
});

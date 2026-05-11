import { Hono, type Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../users/controllers', () => {
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
  };
});

import { v1Router } from './v1.router';

interface HealthResponseBody {
  ok: true;
  service: string;
  status: 'healthy';
  timestamp: string;
}

interface MockControllerResponseBody {
  ok: true;
  data: {
    controller: string;
  };
}

describe('v1Router', () => {
  it('mounts the users health route under /users', async () => {
    const app = new Hono();

    app.route('/api/V1', v1Router);

    const response = await app.request('/api/V1/users/health');
    const body = (await response.json()) as HealthResponseBody;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      service: 'helix-user-service',
      status: 'healthy',
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('does not expose health directly at /health', async () => {
    const app = new Hono();

    app.route('/api/V1', v1Router);

    const response = await app.request('/api/V1/health');

    expect(response.status).toBe(404);
  });

  it('keeps the users collection route mounted', async () => {
    const app = new Hono();

    app.route('/api/V1', v1Router);

    const response = await app.request('/api/V1/users?limit=1');
    const body = (await response.json()) as MockControllerResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.controller).toBe('listUsersController');
  });

  it('keeps the username route mounted', async () => {
    const app = new Hono();

    app.route('/api/V1', v1Router);

    const response = await app.request('/api/V1/users/sinless777');
    const body = (await response.json()) as MockControllerResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.controller).toBe('getUserController');
  });

  it('keeps nested username routes mounted', async () => {
    const app = new Hono();

    app.route('/api/V1', v1Router);

    const profileResponse = await app.request(
      '/api/V1/users/sinless777/profile',
    );
    const settingsResponse = await app.request(
      '/api/V1/users/sinless777/settings',
    );

    const profileBody =
      (await profileResponse.json()) as MockControllerResponseBody;
    const settingsBody =
      (await settingsResponse.json()) as MockControllerResponseBody;

    expect(profileResponse.status).toBe(200);
    expect(settingsResponse.status).toBe(200);
    expect(profileBody.data.controller).toBe('getUserProfileController');
    expect(settingsBody.data.controller).toBe('getUserSettingsController');
  });
});
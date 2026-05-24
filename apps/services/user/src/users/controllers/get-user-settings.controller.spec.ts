import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@aerealith-ai/contracts';

const mocks = vi.hoisted(() => ({
  entityManager: {
    id: 'entity-manager-test',
  },
  getEntityManager: vi.fn(),
  getUsernameParam: vi.fn(),
  getUserSettingsServiceConstructor: vi.fn(),
  getUserSettingsServiceExecute: vi.fn(),
}));

vi.mock('@aerealith-ai/api', () => ({
  getUsernameParam: mocks.getUsernameParam,
}));

vi.mock('@aerealith-ai/db', () => ({
  getEntityManager: mocks.getEntityManager,
}));

vi.mock('../services', () => {
  class GetUserSettingsServiceError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'GetUserSettingsServiceError';
      this.code = code;
    }
  }

  class GetUserSettingsService {
    constructor(options: unknown) {
      mocks.getUserSettingsServiceConstructor(options);
    }

    execute(username: string) {
      return mocks.getUserSettingsServiceExecute(username);
    }
  }

  return {
    GetUserSettingsService,
    GetUserSettingsServiceError,
  };
});

import { GetUserSettingsServiceError } from '../services';

import { getUserSettingsController } from './get-user-settings.controller';

interface SuccessResponseBody {
  ok: true;
  data: {
    userId: string;
    username: string;
    locale: string;
    timezone: string;
    theme: string;
    emailNotificationsEnabled: boolean;
    marketingEmailsEnabled: boolean;
    analyticsEnabled: boolean;
    memoryEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

interface ErrorResponseBody {
  ok: false;
  error: {
    code: string;
    message: string;
    issues?: Array<{
      path: string;
      code: string;
      message: string;
    }>;
  };
}

describe('getUserSettingsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUsernameParam.mockReturnValue({
      ok: true,
      username: 'sinless777',
    });

    mocks.getEntityManager.mockResolvedValue(mocks.entityManager);

    mocks.getUserSettingsServiceExecute.mockResolvedValue({
      userId: 'user_123',
      username: 'sinless777',
      locale: 'en-US',
      timezone: 'America/Boise',
      theme: 'dark',
      emailNotificationsEnabled: true,
      marketingEmailsEnabled: false,
      analyticsEnabled: true,
      memoryEnabled: true,
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('returns user settings', async () => {
    const app = new Hono();

    app.get('/users/:username/settings', getUserSettingsController);

    const response = await app.request('/users/sinless777/settings');
    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(200);

    expect(mocks.getUsernameParam).toHaveBeenCalledTimes(1);
    expect(mocks.getEntityManager).toHaveBeenCalledTimes(1);
    expect(mocks.getUserSettingsServiceConstructor).toHaveBeenCalledWith({
      entityManager: mocks.entityManager,
    });
    expect(mocks.getUserSettingsServiceExecute).toHaveBeenCalledWith(
      'sinless777',
    );

    expect(body).toEqual({
      ok: true,
      data: {
        userId: 'user_123',
        username: 'sinless777',
        locale: 'en-US',
        timezone: 'America/Boise',
        theme: 'dark',
        emailNotificationsEnabled: true,
        marketingEmailsEnabled: false,
        analyticsEnabled: true,
        memoryEnabled: true,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    });
  });

  it('returns 400 when the username route param is invalid', async () => {
    mocks.getUsernameParam.mockReturnValue({
      ok: false,
      code: UserErrorCode.INVALID_USERNAME,
      message: 'Invalid username.',
      issues: [
        {
          path: ['username'],
          code: 'custom',
          message: 'Invalid username.',
        },
      ],
    });

    const app = new Hono();

    app.get('/users/:username/settings', getUserSettingsController);

    const response = await app.request('/users/invalid username/settings');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: UserErrorCode.INVALID_USERNAME,
        message: 'Invalid username.',
        issues: [
          {
            path: 'username',
            code: 'custom',
            message: 'Invalid username.',
          },
        ],
      },
    });

    expect(mocks.getEntityManager).not.toHaveBeenCalled();
    expect(mocks.getUserSettingsServiceConstructor).not.toHaveBeenCalled();
    expect(mocks.getUserSettingsServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    mocks.getUserSettingsServiceExecute.mockRejectedValue(
      new GetUserSettingsServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      ),
    );

    const app = new Hono();

    app.get('/users/:username/settings', getUserSettingsController);

    const response = await app.request('/users/missing-user/settings');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: UserErrorCode.USER_NOT_FOUND,
        message: 'User not found.',
      },
    });
  });

  it('returns 404 when user settings do not exist', async () => {
    mocks.getUserSettingsServiceExecute.mockRejectedValue(
      new GetUserSettingsServiceError(
        UserErrorCode.USER_SETTINGS_NOT_FOUND,
        'User settings not found.',
      ),
    );

    const app = new Hono();

    app.get('/users/:username/settings', getUserSettingsController);

    const response = await app.request('/users/sinless777/settings');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: UserErrorCode.USER_SETTINGS_NOT_FOUND,
        message: 'User settings not found.',
      },
    });
  });

  it('returns 500 for unexpected errors', async () => {
    const error = new Error('Database unavailable');

    mocks.getUserSettingsServiceExecute.mockRejectedValue(error);

    const app = new Hono();

    app.get('/users/:username/settings', getUserSettingsController);

    const response = await app.request('/users/sinless777/settings');

    expect(response.status).toBe(500);
  });
});
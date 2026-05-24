import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@aerealith-ai/contracts';

const mocks = vi.hoisted(() => ({
  entityManager: {
    id: 'entity-manager-test',
  },
  getEntityManager: vi.fn(),
  getUsernameParam: vi.fn(),
  getUserProfileServiceConstructor: vi.fn(),
  getUserProfileServiceExecute: vi.fn(),
}));

vi.mock('@aerealith-ai/api', () => ({
  getUsernameParam: mocks.getUsernameParam,
}));

vi.mock('@aerealith-ai/db', () => ({
  getEntityManager: mocks.getEntityManager,
}));

vi.mock('../services', () => {
  class GetUserProfileServiceError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'GetUserProfileServiceError';
      this.code = code;
    }
  }

  class GetUserProfileService {
    constructor(options: unknown) {
      mocks.getUserProfileServiceConstructor(options);
    }

    execute(username: string) {
      return mocks.getUserProfileServiceExecute(username);
    }
  }

  return {
    GetUserProfileService,
    GetUserProfileServiceError,
  };
});

import { GetUserProfileServiceError } from '../services';

import { getUserProfileController } from './get-user-profile.controller';

interface SuccessResponseBody {
  ok: true;
  data: {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    location: string | null;
    websiteUrl: string | null;
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

describe('getUserProfileController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUsernameParam.mockReturnValue({
      ok: true,
      username: 'sinless777',
    });

    mocks.getEntityManager.mockResolvedValue(mocks.entityManager);

    mocks.getUserProfileServiceExecute.mockResolvedValue({
      userId: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'Game developer and full-stack developer.',
      location: null,
      websiteUrl: null,
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('returns a user profile', async () => {
    const app = new Hono();

    app.get('/users/:username/profile', getUserProfileController);

    const response = await app.request('/users/sinless777/profile');
    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(200);

    expect(mocks.getUsernameParam).toHaveBeenCalledTimes(1);
    expect(mocks.getEntityManager).toHaveBeenCalledTimes(1);
    expect(mocks.getUserProfileServiceConstructor).toHaveBeenCalledWith({
      entityManager: mocks.entityManager,
    });
    expect(mocks.getUserProfileServiceExecute).toHaveBeenCalledWith(
      'sinless777',
    );

    expect(body).toEqual({
      ok: true,
      data: {
        userId: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        avatarUrl: 'https://example.com/avatar.png',
        bio: 'Game developer and full-stack developer.',
        location: null,
        websiteUrl: null,
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

    app.get('/users/:username/profile', getUserProfileController);

    const response = await app.request('/users/invalid username/profile');
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
    expect(mocks.getUserProfileServiceConstructor).not.toHaveBeenCalled();
    expect(mocks.getUserProfileServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    mocks.getUserProfileServiceExecute.mockRejectedValue(
      new GetUserProfileServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      ),
    );

    const app = new Hono();

    app.get('/users/:username/profile', getUserProfileController);

    const response = await app.request('/users/missing-user/profile');
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

  it('returns 404 when the user profile does not exist', async () => {
    mocks.getUserProfileServiceExecute.mockRejectedValue(
      new GetUserProfileServiceError(
        UserErrorCode.USER_PROFILE_NOT_FOUND,
        'User profile not found.',
      ),
    );

    const app = new Hono();

    app.get('/users/:username/profile', getUserProfileController);

    const response = await app.request('/users/sinless777/profile');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: UserErrorCode.USER_PROFILE_NOT_FOUND,
        message: 'User profile not found.',
      },
    });
  });

  it('returns 500 for unexpected errors', async () => {
    const error = new Error('Database unavailable');

    mocks.getUserProfileServiceExecute.mockRejectedValue(error);

    const app = new Hono();

    app.get('/users/:username/profile', getUserProfileController);

    const response = await app.request('/users/sinless777/profile');

    expect(response.status).toBe(500);
  });
});
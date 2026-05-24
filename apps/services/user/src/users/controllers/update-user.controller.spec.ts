import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@aerealith-ai/contracts';

const mocks = vi.hoisted(() => ({
  entityManager: {
    id: 'entity-manager-test',
  },
  getEntityManager: vi.fn(),
  getUsernameParam: vi.fn(),
  updateUserServiceConstructor: vi.fn(),
  updateUserServiceExecute: vi.fn(),
}));

vi.mock('@aerealith-ai/api', () => ({
  getUsernameParam: mocks.getUsernameParam,
}));

vi.mock('@aerealith-ai/db', () => ({
  getEntityManager: mocks.getEntityManager,
}));

vi.mock('../services', () => {
  class UpdateUserServiceError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'UpdateUserServiceError';
      this.code = code;
    }
  }

  class UpdateUserService {
    constructor(options: unknown) {
      mocks.updateUserServiceConstructor(options);
    }

    execute(username: string, input: unknown) {
      return mocks.updateUserServiceExecute(username, input);
    }
  }

  return {
    UpdateUserService,
    UpdateUserServiceError,
  };
});

import { UpdateUserServiceError } from '../services';

import { updateUserController } from './update-user.controller';

interface SuccessResponseBody {
  ok: true;
  data: {
    id: string;
    username: string;
    displayName: string;
    status: string;
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

describe('updateUserController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUsernameParam.mockReturnValue({
      ok: true,
      username: 'sinless777',
    });

    mocks.getEntityManager.mockResolvedValue(mocks.entityManager);

    mocks.updateUserServiceExecute.mockResolvedValue({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'active',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:01.000Z',
    });
  });

  it('updates a user and returns 200', async () => {
    const app = new Hono();

    app.patch('/users/:username', updateUserController);

    const response = await app.request('/users/sinless777', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Sinless777',
        status: 'active',
      }),
    });

    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(200);

    expect(mocks.getUsernameParam).toHaveBeenCalledTimes(1);
    expect(mocks.getEntityManager).toHaveBeenCalledTimes(1);
    expect(mocks.updateUserServiceConstructor).toHaveBeenCalledWith({
      entityManager: mocks.entityManager,
    });
    expect(mocks.updateUserServiceExecute).toHaveBeenCalledWith('sinless777', {
      displayName: 'Sinless777',
      status: 'active',
    });

    expect(body).toEqual({
      ok: true,
      data: {
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'active',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:01.000Z',
      },
    });
  });

  it('updates a user with only displayName', async () => {
    const app = new Hono();

    app.patch('/users/:username', updateUserController);

    const response = await app.request('/users/sinless777', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Sinless777',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updateUserServiceExecute).toHaveBeenCalledWith('sinless777', {
      displayName: 'Sinless777',
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

    app.patch('/users/:username', updateUserController);

    const response = await app.request('/users/invalid username', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Sinless777',
      }),
    });

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
    expect(mocks.updateUserServiceConstructor).not.toHaveBeenCalled();
    expect(mocks.updateUserServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when the request body is invalid', async () => {
    const app = new Hono();

    app.patch('/users/:username', updateUserController);

    const response = await app.request('/users/sinless777', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: '',
        status: 'not-a-valid-status',
      }),
    });

    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(UserErrorCode.INVALID_PROFILE_PAYLOAD);
    expect(body.error.message).toEqual(expect.any(String));
    expect(body.error.issues).toEqual(expect.any(Array));

    expect(mocks.getEntityManager).not.toHaveBeenCalled();
    expect(mocks.updateUserServiceConstructor).not.toHaveBeenCalled();
    expect(mocks.updateUserServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const app = new Hono();

    app.patch('/users/:username', updateUserController);

    const response = await app.request('/users/sinless777', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: '{',
    });

    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(UserErrorCode.INVALID_PROFILE_PAYLOAD);

    expect(mocks.getEntityManager).not.toHaveBeenCalled();
    expect(mocks.updateUserServiceConstructor).not.toHaveBeenCalled();
    expect(mocks.updateUserServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    mocks.updateUserServiceExecute.mockRejectedValue(
      new UpdateUserServiceError(UserErrorCode.USER_NOT_FOUND, 'User not found.'),
    );

    const app = new Hono();

    app.patch('/users/:username', updateUserController);

    const response = await app.request('/users/missing-user', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Missing User',
      }),
    });

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

  it('returns 500 when the update operation fails', async () => {
    mocks.updateUserServiceExecute.mockRejectedValue(
      new UpdateUserServiceError(
        UserErrorCode.USER_UPDATE_FAILED,
        'Failed to update user.',
      ),
    );

    const app = new Hono();

    app.patch('/users/:username', updateUserController);

    const response = await app.request('/users/sinless777', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Sinless777',
      }),
    });

    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: {
        code: UserErrorCode.USER_UPDATE_FAILED,
        message: 'Failed to update user.',
      },
    });
  });

  it('returns 500 for unexpected errors', async () => {
    const error = new Error('Database unavailable');

    mocks.updateUserServiceExecute.mockRejectedValue(error);

    const app = new Hono();

    app.patch('/users/:username', updateUserController);

    const response = await app.request('/users/sinless777', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Sinless777',
      }),
    });

    expect(response.status).toBe(500);
  });
});
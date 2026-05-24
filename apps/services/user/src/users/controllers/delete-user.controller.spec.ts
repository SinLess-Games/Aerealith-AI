import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@aerealith-ai/contracts';

const mocks = vi.hoisted(() => ({
  entityManager: {
    id: 'entity-manager-test',
  },
  getEntityManager: vi.fn(),
  getUsernameParam: vi.fn(),
  deleteUserServiceConstructor: vi.fn(),
  deleteUserServiceExecute: vi.fn(),
}));

vi.mock('@aerealith-ai/api', () => ({
  getUsernameParam: mocks.getUsernameParam,
}));

vi.mock('@aerealith-ai/db', () => ({
  getEntityManager: mocks.getEntityManager,
}));

vi.mock('../services', () => {
  class DeleteUserServiceError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'DeleteUserServiceError';
      this.code = code;
    }
  }

  class DeleteUserService {
    constructor(options: unknown) {
      mocks.deleteUserServiceConstructor(options);
    }

    execute(username: string) {
      return mocks.deleteUserServiceExecute(username);
    }
  }

  return {
    DeleteUserService,
    DeleteUserServiceError,
  };
});

import { DeleteUserServiceError } from '../services';

import { deleteUserController } from './delete-user.controller';

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

describe('deleteUserController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUsernameParam.mockReturnValue({
      ok: true,
      username: 'sinless777',
    });

    mocks.getEntityManager.mockResolvedValue(mocks.entityManager);

    mocks.deleteUserServiceExecute.mockResolvedValue({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'deleted',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('deletes a user and returns 200', async () => {
    const app = new Hono();

    app.delete('/users/:username', deleteUserController);

    const response = await app.request('/users/sinless777', {
      method: 'DELETE',
    });

    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(200);

    expect(mocks.getUsernameParam).toHaveBeenCalledTimes(1);
    expect(mocks.getEntityManager).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUserServiceConstructor).toHaveBeenCalledWith({
      entityManager: mocks.entityManager,
    });
    expect(mocks.deleteUserServiceExecute).toHaveBeenCalledWith('sinless777');

    expect(body).toEqual({
      ok: true,
      data: {
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'deleted',
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

    app.delete('/users/:username', deleteUserController);

    const response = await app.request('/users/invalid username', {
      method: 'DELETE',
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
    expect(mocks.deleteUserServiceConstructor).not.toHaveBeenCalled();
    expect(mocks.deleteUserServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    mocks.deleteUserServiceExecute.mockRejectedValue(
      new DeleteUserServiceError(UserErrorCode.USER_NOT_FOUND, 'User not found.'),
    );

    const app = new Hono();

    app.delete('/users/:username', deleteUserController);

    const response = await app.request('/users/missing-user', {
      method: 'DELETE',
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

  it('returns 500 when the delete operation fails', async () => {
    mocks.deleteUserServiceExecute.mockRejectedValue(
      new DeleteUserServiceError(
        UserErrorCode.USER_DELETE_FAILED,
        'Failed to delete user.',
      ),
    );

    const app = new Hono();

    app.delete('/users/:username', deleteUserController);

    const response = await app.request('/users/sinless777', {
      method: 'DELETE',
    });

    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: {
        code: UserErrorCode.USER_DELETE_FAILED,
        message: 'Failed to delete user.',
      },
    });
  });

  it('returns 500 for unexpected errors', async () => {
    const error = new Error('Database unavailable');

    mocks.deleteUserServiceExecute.mockRejectedValue(error);

    const app = new Hono();

    app.delete('/users/:username', deleteUserController);

    const response = await app.request('/users/sinless777', {
      method: 'DELETE',
    });

    expect(response.status).toBe(500);
  });
});
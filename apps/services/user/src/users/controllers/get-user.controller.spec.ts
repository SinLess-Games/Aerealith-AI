import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@aerealith-ai/contracts';

const mocks = vi.hoisted(() => ({
  entityManager: {
    id: 'entity-manager-test',
  },
  getEntityManager: vi.fn(),
  getUsernameParam: vi.fn(),
  getUserServiceConstructor: vi.fn(),
  getUserServiceExecute: vi.fn(),
}));

vi.mock('@aerealith-ai/api', () => ({
  getUsernameParam: mocks.getUsernameParam,
}));

vi.mock('@aerealith-ai/db', () => ({
  getEntityManager: mocks.getEntityManager,
}));

vi.mock('../services', () => {
  class GetUserServiceError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'GetUserServiceError';
      this.code = code;
    }
  }

  class GetUserService {
    constructor(options: unknown) {
      mocks.getUserServiceConstructor(options);
    }

    execute(username: string) {
      return mocks.getUserServiceExecute(username);
    }
  }

  return {
    GetUserService,
    GetUserServiceError,
  };
});

import { GetUserServiceError } from '../services';

import { getUserController } from './get-user.controller';

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

describe('getUserController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUsernameParam.mockReturnValue({
      ok: true,
      username: 'sinless777',
    });

    mocks.getEntityManager.mockResolvedValue(mocks.entityManager);

    mocks.getUserServiceExecute.mockResolvedValue({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'active',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('returns a user', async () => {
    const app = new Hono();

    app.get('/users/:username', getUserController);

    const response = await app.request('/users/sinless777');
    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(200);

    expect(mocks.getUsernameParam).toHaveBeenCalledTimes(1);
    expect(mocks.getEntityManager).toHaveBeenCalledTimes(1);
    expect(mocks.getUserServiceConstructor).toHaveBeenCalledWith({
      entityManager: mocks.entityManager,
    });
    expect(mocks.getUserServiceExecute).toHaveBeenCalledWith('sinless777');

    expect(body).toEqual({
      ok: true,
      data: {
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'active',
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

    app.get('/users/:username', getUserController);

    const response = await app.request('/users/invalid username');
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
    expect(mocks.getUserServiceConstructor).not.toHaveBeenCalled();
    expect(mocks.getUserServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    mocks.getUserServiceExecute.mockRejectedValue(
      new GetUserServiceError(UserErrorCode.USER_NOT_FOUND, 'User not found.'),
    );

    const app = new Hono();

    app.get('/users/:username', getUserController);

    const response = await app.request('/users/missing-user');
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

  it('returns 500 for unexpected errors', async () => {
    const error = new Error('Database unavailable');

    mocks.getUserServiceExecute.mockRejectedValue(error);

    const app = new Hono();

    app.get('/users/:username', getUserController);

    const response = await app.request('/users/sinless777');

    expect(response.status).toBe(500);
  });
});
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@helix-ai/contracts';

const mocks = vi.hoisted(() => ({
  entityManager: {
    id: 'entity-manager-test',
  },
  getEntityManager: vi.fn(),
  createUserServiceExecute: vi.fn(),
  createUserServiceConstructor: vi.fn(),
}));

vi.mock('@helix-ai/db', () => ({
  getEntityManager: mocks.getEntityManager,
}));

vi.mock('../services', () => {
  class CreateUserServiceError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'CreateUserServiceError';
      this.code = code;
    }
  }

  class CreateUserService {
    constructor(options: unknown) {
      mocks.createUserServiceConstructor(options);
    }

    execute(input: unknown) {
      return mocks.createUserServiceExecute(input);
    }
  }

  return {
    CreateUserService,
    CreateUserServiceError,
  };
});

import { CreateUserServiceError } from '../services';

import { createUserController } from './create-user.controller';

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

describe('createUserController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getEntityManager.mockResolvedValue(mocks.entityManager);

    mocks.createUserServiceExecute.mockResolvedValue({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'pending',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('creates a user and returns 201', async () => {
    const app = new Hono();

    app.post('/users', createUserController);

    const response = await app.request('/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'sinless777',
        email: 'andy@example.com',
        displayName: 'Sinless777',
      }),
    });

    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(201);

    expect(mocks.getEntityManager).toHaveBeenCalledTimes(1);
    expect(mocks.createUserServiceConstructor).toHaveBeenCalledWith({
      entityManager: mocks.entityManager,
    });

    expect(mocks.createUserServiceExecute).toHaveBeenCalledWith({
      username: 'sinless777',
      email: 'andy@example.com',
      displayName: 'Sinless777',
    });

    expect(body).toEqual({
      ok: true,
      data: {
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'pending',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    });
  });

  it('returns 400 when the request body is invalid', async () => {
    const app = new Hono();

    app.post('/users', createUserController);

    const response = await app.request('/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: '',
        email: 'not-an-email',
      }),
    });

    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(UserErrorCode.INVALID_PROFILE_PAYLOAD);
    expect(body.error.message).toEqual(expect.any(String));
    expect(body.error.issues).toEqual(expect.any(Array));

    expect(mocks.getEntityManager).not.toHaveBeenCalled();
    expect(mocks.createUserServiceConstructor).not.toHaveBeenCalled();
    expect(mocks.createUserServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const app = new Hono();

    app.post('/users', createUserController);

    const response = await app.request('/users', {
      method: 'POST',
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
    expect(mocks.createUserServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 409 when the user already exists', async () => {
    mocks.createUserServiceExecute.mockRejectedValue(
      new CreateUserServiceError(
        UserErrorCode.USER_ALREADY_EXISTS,
        'A user with that username already exists.',
      ),
    );

    const app = new Hono();

    app.post('/users', createUserController);

    const response = await app.request('/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'sinless777',
        email: 'andy@example.com',
      }),
    });

    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: {
        code: UserErrorCode.USER_ALREADY_EXISTS,
        message: 'A user with that username already exists.',
      },
    });
  });

  it('returns 500 for unexpected errors', async () => {
    const error = new Error('Database unavailable');

    mocks.createUserServiceExecute.mockRejectedValue(error);

    const app = new Hono();

    app.post('/users', createUserController);

    const response = await app.request('/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'sinless777',
        email: 'andy@example.com',
      }),
    });

    expect(response.status).toBe(500);
  });
});
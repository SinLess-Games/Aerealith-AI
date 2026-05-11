import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entityManager: {
    id: 'entity-manager-test',
  },
  getEntityManager: vi.fn(),
  listUsersServiceConstructor: vi.fn(),
  listUsersServiceExecute: vi.fn(),
}));

vi.mock('@helix-ai/db', () => ({
  getEntityManager: mocks.getEntityManager,
}));

vi.mock('../services', () => {
  class ListUsersService {
    constructor(options: unknown) {
      mocks.listUsersServiceConstructor(options);
    }

    execute(input: unknown) {
      return mocks.listUsersServiceExecute(input);
    }
  }

  return {
    ListUsersService,
  };
});

import { listUsersController } from './list-users.controller';

interface SuccessResponseBody {
  ok: true;
  data: Array<{
    id: string;
    username: string;
    displayName: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  meta: {
    limit: number;
    offset: number;
    count: number;
  };
}

interface ErrorResponseBody {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

describe('listUsersController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getEntityManager.mockResolvedValue(mocks.entityManager);

    mocks.listUsersServiceExecute.mockResolvedValue([
      {
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'active',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
      {
        id: 'user_456',
        username: 'helixuser',
        displayName: 'Helix User',
        status: 'pending',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    ]);
  });

  it('lists users with default query values', async () => {
    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users');
    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(200);

    expect(mocks.getEntityManager).toHaveBeenCalledTimes(1);
    expect(mocks.listUsersServiceConstructor).toHaveBeenCalledWith({
      entityManager: mocks.entityManager,
    });
    expect(mocks.listUsersServiceExecute).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      includeDeleted: false,
    });

    expect(body).toEqual({
      ok: true,
      data: [
        {
          id: 'user_123',
          username: 'sinless777',
          displayName: 'Sinless777',
          status: 'active',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
        {
          id: 'user_456',
          username: 'helixuser',
          displayName: 'Helix User',
          status: 'pending',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
      meta: {
        limit: 50,
        offset: 0,
        count: 2,
      },
    });
  });

  it('passes pagination query values to the service', async () => {
    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users?limit=25&offset=50');
    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(200);
    expect(mocks.listUsersServiceExecute).toHaveBeenCalledWith({
      limit: 25,
      offset: 50,
      includeDeleted: false,
    });
    expect(body.meta).toEqual({
      limit: 25,
      offset: 50,
      count: 2,
    });
  });

  it('passes includeDeleted=true to the service', async () => {
    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users?includeDeleted=true');

    expect(response.status).toBe(200);
    expect(mocks.listUsersServiceExecute).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      includeDeleted: true,
    });
  });

  it.each(['1', 'yes', 'y', 'on'])(
    'treats includeDeleted=%s as true',
    async (value) => {
      const app = new Hono();

      app.get('/users', listUsersController);

      const response = await app.request(`/users?includeDeleted=${value}`);

      expect(response.status).toBe(200);
      expect(mocks.listUsersServiceExecute).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
        includeDeleted: true,
      });
    },
  );

  it('returns an empty list with count 0', async () => {
    mocks.listUsersServiceExecute.mockResolvedValue([]);

    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users?limit=10&offset=5');
    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: [],
      meta: {
        limit: 10,
        offset: 5,
        count: 0,
      },
    });
  });

  it('returns 400 when limit is not an integer', async () => {
    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users?limit=abc');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'INVALID_USER_LIST_QUERY',
        message: 'limit must be an integer.',
      },
    });

    expect(mocks.getEntityManager).not.toHaveBeenCalled();
    expect(mocks.listUsersServiceConstructor).not.toHaveBeenCalled();
    expect(mocks.listUsersServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when offset is not an integer', async () => {
    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users?offset=abc');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'INVALID_USER_LIST_QUERY',
        message: 'offset must be an integer.',
      },
    });

    expect(mocks.getEntityManager).not.toHaveBeenCalled();
    expect(mocks.listUsersServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when limit is below 1', async () => {
    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users?limit=0');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'INVALID_USER_LIST_QUERY',
        message: 'limit must be between 1 and 100.',
      },
    });

    expect(mocks.getEntityManager).not.toHaveBeenCalled();
    expect(mocks.listUsersServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when limit is above 100', async () => {
    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users?limit=101');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'INVALID_USER_LIST_QUERY',
        message: 'limit must be between 1 and 100.',
      },
    });

    expect(mocks.getEntityManager).not.toHaveBeenCalled();
    expect(mocks.listUsersServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when offset is below 0', async () => {
    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users?offset=-1');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'INVALID_USER_LIST_QUERY',
        message: 'offset must be greater than or equal to 0.',
      },
    });

    expect(mocks.getEntityManager).not.toHaveBeenCalled();
    expect(mocks.listUsersServiceExecute).not.toHaveBeenCalled();
  });

  it('returns 500 for unexpected errors', async () => {
    const error = new Error('Database unavailable');

    mocks.listUsersServiceExecute.mockRejectedValue(error);

    const app = new Hono();

    app.get('/users', listUsersController);

    const response = await app.request('/users');

    expect(response.status).toBe(500);
  });
});
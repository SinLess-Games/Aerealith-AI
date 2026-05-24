import { Hono, type Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@aerealith-ai/contracts';

const mocks = vi.hoisted(() => ({
  getUsernameParam: vi.fn(),
}));

vi.mock('@aerealith-ai/api', () => ({
  getUsernameParam: mocks.getUsernameParam,
}));

import {
  USERNAME_CONTEXT_KEY,
  getGuardedUsername,
  usernameGuard,
  type UsernameGuardVariables,
} from './username.guard';

interface SuccessResponseBody {
  ok: true;
  username: string;
  guardedUsername: string;
}

interface ErrorResponseBody {
  ok: false;
  error: {
    code: string;
    message: string;
    issues: Array<{
      path: string;
      code: string;
      message: string;
    }>;
  };
}

describe('usernameGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUsernameParam.mockReturnValue({
      ok: true,
      username: 'sinless777',
    });
  });

  it('stores the validated username in context and continues to the route handler', async () => {
    const app = new Hono<{
      Variables: UsernameGuardVariables;
    }>();

    app.use('/users/:username', usernameGuard);

    app.get('/users/:username', (context) =>
      context.json({
        ok: true,
        username: context.get(USERNAME_CONTEXT_KEY),
        guardedUsername: getGuardedUsername(context),
      }),
    );

    const response = await app.request('/users/sinless777');
    const body = (await response.json()) as SuccessResponseBody;

    expect(response.status).toBe(200);
    expect(mocks.getUsernameParam).toHaveBeenCalledTimes(1);

    expect(body).toEqual({
      ok: true,
      username: 'sinless777',
      guardedUsername: 'sinless777',
    });
  });

  it('returns 400 and does not continue when username validation fails', async () => {
    const handler = vi.fn((context: Context) =>
      context.json({
        ok: true,
      }),
    );

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

    const app = new Hono<{
      Variables: UsernameGuardVariables;
    }>();

    app.use('/users/:username', usernameGuard);
    app.get('/users/:username', handler);

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

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('getGuardedUsername', () => {
  it('returns the username from context', () => {
    const context = {
      get: vi.fn((key: string) => {
        if (key === USERNAME_CONTEXT_KEY) {
          return 'sinless777';
        }

        return undefined;
      }),
    } as unknown as Context;

    expect(getGuardedUsername(context)).toBe('sinless777');
  });

  it('throws when the username is missing from context', () => {
    const context = {
      get: vi.fn(() => undefined),
    } as unknown as Context;

    expect(() => getGuardedUsername(context)).toThrow(
      'USERNAME_GUARD_MISSING_USERNAME',
    );
  });

  it('throws when the username is empty', () => {
    const context = {
      get: vi.fn(() => ''),
    } as unknown as Context;

    expect(() => getGuardedUsername(context)).toThrow(
      'USERNAME_GUARD_MISSING_USERNAME',
    );
  });
});
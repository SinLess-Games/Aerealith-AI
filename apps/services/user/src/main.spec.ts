import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appFetch: vi.fn(),
}));

vi.mock('./app', () => ({
  default: {
    fetch: mocks.appFetch,
  },
}));

import worker from './main';

describe('user service worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.appFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          service: 'helix-user-service',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
  });

  it('exports a fetch handler', () => {
    expect(worker).toEqual({
      fetch: expect.any(Function),
    });
  });

  it('delegates requests to the Hono app fetch handler', async () => {
    const request = new Request('https://helixaibot.com/api/V1/users/health');

    const env = {
      SERVICE_NAME: 'helix-user-service-test',
      SERVICE_VERSION: '1.2.3',
    };

    const executionContext = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const response = await worker.fetch(request, env, executionContext);
    const body = (await response.json()) as {
      ok: true;
      service: string;
    };

    expect(mocks.appFetch).toHaveBeenCalledTimes(1);
    expect(mocks.appFetch).toHaveBeenCalledWith(
      request,
      env,
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      service: 'helix-user-service',
    });
  });

  it('returns the response produced by the Hono app', async () => {
    const expectedResponse = new Response('created', {
      status: 201,
    });

    mocks.appFetch.mockResolvedValue(expectedResponse);

    const request = new Request('https://helixaibot.com/api/V1/users', {
      method: 'POST',
    });

    const env = {};
    const executionContext = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const response = await worker.fetch(request, env, executionContext);

    expect(response).toBe(expectedResponse);
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('created');
  });

  it('propagates errors from the Hono app fetch handler', async () => {
    const error = new Error('App fetch failed');

    mocks.appFetch.mockRejectedValue(error);

    const request = new Request('https://helixaibot.com/api/V1/users');
    const env = {};
    const executionContext = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    await expect(worker.fetch(request, env, executionContext)).rejects.toThrow(
      'App fetch failed',
    );
  });
});
import { describe, expect, it, vi } from 'vitest';

vi.mock('./routes', async () => {
  const { Hono } = await import('hono');

  const v1Router = new Hono();

  v1Router.get('/users/health', (context) =>
    context.json({
      ok: true,
      service: 'helix-user-service',
      status: 'healthy',
      timestamp: '2026-05-10T00:00:00.000Z',
    }),
  );

  v1Router.get('/boom', () => {
    throw new Error('Route exploded');
  });

  return {
    v1Router,
  };
});

import app from './app';

interface RootResponseBody {
  ok: true;
  service: string;
  status: 'running';
  routes: {
    health: string;
    users: string;
  };
  timestamp: string;
}

interface HealthResponseBody {
  ok: true;
  service: string;
  status: 'healthy';
  timestamp: string;
}

interface ErrorResponseBody {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

describe('app', () => {
  it('returns the root service response', async () => {
    const response = await app.request('/');
    const body = (await response.json()) as RootResponseBody;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      service: 'helix-user-service',
      status: 'running',
      routes: {
        health: '/api/V1/users/health',
        users: '/api/V1/users',
      },
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('uses SERVICE_NAME from bindings on the root response', async () => {
    const response = await app.request(
      '/',
      {},
      {
        SERVICE_NAME: 'helix-user-service-test',
      },
    );

    const body = (await response.json()) as RootResponseBody;

    expect(response.status).toBe(200);
    expect(body.service).toBe('helix-user-service-test');
  });

  it('mounts the v1 router under /api/V1', async () => {
    const response = await app.request('/api/V1/users/health');
    const body = (await response.json()) as HealthResponseBody;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      service: 'helix-user-service',
      status: 'healthy',
      timestamp: '2026-05-10T00:00:00.000Z',
    });
  });

  it('returns a JSON 404 response for unknown routes', async () => {
    const response = await app.request('/missing');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
    });
  });

  it('returns a JSON 500 response for unexpected errors', async () => {
    const response = await app.request('/api/V1/boom');
    const body = (await response.json()) as ErrorResponseBody;

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
  });
});
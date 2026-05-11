import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { healthController } from './health.controller';

interface HealthResponseBody {
  ok: true;
  service: string;
  status: 'healthy';
  version: string;
  timestamp: string;
}

describe('healthController', () => {
  it('returns the default health response', async () => {
    const app = new Hono();

    app.get('/health', healthController);

    const response = await app.request('/health');
    const body = (await response.json()) as HealthResponseBody;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      service: 'helix-user-service',
      status: 'healthy',
      version: '0.1.0',
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('uses service metadata from context env when provided', async () => {
    const app = new Hono<{
      Bindings: {
        SERVICE_NAME?: string;
        SERVICE_VERSION?: string;
      };
    }>();

    app.get('/health', healthController);

    const response = await app.request(
      '/health',
      {},
      {
        SERVICE_NAME: 'helix-user-service-test',
        SERVICE_VERSION: '1.2.3',
      },
    );

    const body = (await response.json()) as HealthResponseBody;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      service: 'helix-user-service-test',
      status: 'healthy',
      version: '1.2.3',
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
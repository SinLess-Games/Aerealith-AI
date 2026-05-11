import { describe, expect, it } from 'vitest';

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns a healthy response with default values', () => {
    const service = new HealthService();

    const result = service.check();

    expect(result.ok).toBe(true);
    expect(result.service).toBe('helix-user-service');
    expect(result.status).toBe('healthy');
    expect(result.version).toBe('0.1.0');
    expect(result.timestamp).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('returns a healthy response with custom service metadata', () => {
    const service = new HealthService({
      serviceName: 'helix-user-service-test',
      serviceVersion: '1.2.3',
    });

    const result = service.check();

    expect(result).toEqual({
      ok: true,
      service: 'helix-user-service-test',
      status: 'healthy',
      version: '1.2.3',
      timestamp: expect.any(String),
    });
  });

  it('generates a fresh timestamp for each health check', async () => {
    const service = new HealthService();

    const first = service.check();

    await new Promise((resolve) => setTimeout(resolve, 1));

    const second = service.check();

    expect(Date.parse(second.timestamp)).toBeGreaterThanOrEqual(
      Date.parse(first.timestamp),
    );
  });
});
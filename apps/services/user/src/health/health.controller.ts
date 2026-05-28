import type { Context } from 'hono';

import { HealthService } from './health.service';

export const healthController = (context: Context): Response => {
  const service = new HealthService({
    serviceName: context.env?.SERVICE_NAME ?? 'aerealith-user-service',
    serviceVersion: context.env?.SERVICE_VERSION ?? '0.1.0',
  });

  return context.json(service.check());
};
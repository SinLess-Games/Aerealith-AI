import type { ExecutionContext } from '@cloudflare/workers-types';

import { getOrm } from '@aerealith-ai/db';
import {
  createLogger,
  createRequestContextFromRequest,
  createTraceSessionFromRequest,
  initServerTelemetry,
  runWithLogContext,
  runWithTraceSession,
  withTraceSpan,
} from '@aerealith-ai/observability';

import app from './app';
import type { UserServiceContextEnv } from './users/types';

export interface UserServiceWorker {
  fetch(
    request: Request,
    env: UserServiceContextEnv,
    executionContext: ExecutionContext,
  ): Response | Promise<Response>;
}

const startupOrmPromise = getOrm();

startupOrmPromise.catch(() => {
  // Keep health checks available when local database credentials are absent.
});

const worker: UserServiceWorker = {
  fetch(
    request: Request,
    env: UserServiceContextEnv,
    executionContext: ExecutionContext,
  ): Response | Promise<Response> {
    const telemetry = initServerTelemetry({
      service: env.SERVICE_NAME ?? 'aerealith-user-service',
      env: {
        NODE_ENV: env.NODE_ENV,
        TEMPO_API_TOKEN: env.TEMPO_API_TOKEN,
      },
      server: {
        token: env.TEMPO_API_TOKEN,
      },
    });
    const requestContext = createRequestContextFromRequest(request, {
      service: env.SERVICE_NAME ?? 'aerealith-user-service',
    });
    const traceSession = createTraceSessionFromRequest(request, {
      service: env.SERVICE_NAME ?? 'aerealith-user-service',
    });
    const logger = createLogger({
      service: env.SERVICE_NAME ?? 'aerealith-user-service',
      env: {
        NODE_ENV: env.NODE_ENV,
        SERVICE_NAME: env.SERVICE_NAME,
        LOKI_API_TOKEN: env.LOKI_API_TOKEN,
        TEMPO_API_TOKEN: env.TEMPO_API_TOKEN,
      },
    });

    return runWithTraceSession(traceSession, async () =>
      runWithLogContext(requestContext, async () => {
        const response = await withTraceSpan(
          'user.request',
          {
            metadata: {
              method: request.method,
              path: new URL(request.url).pathname,
            },
            tags: ['user'],
          },
          async () => app.fetch(request, env, executionContext),
        );

        logger.info('User worker request completed', {
          success: response.ok,
          failed: !response.ok,
          tags: [response.ok ? 'success' : 'failed'],
          metadata: {
            method: request.method,
            path: new URL(request.url).pathname,
            status: response.status,
          },
        });

        executionContext.waitUntil(telemetry?.flush() ?? Promise.resolve());

        return response;
      }),
    );
  },
};

export default worker;

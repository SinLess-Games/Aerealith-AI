import type { ExecutionContext, Hono } from 'hono';

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
import {
  AUTH_MAIN_DEFAULTS,
  createConfiguredAuthApp,
} from './main.helpers';

import type { AuthHonoEnv } from './types/auth-context.type';

export type AuthWorkerBindings = {
  LOKI_API_TOKEN?: string;
  TEMPO_API_TOKEN?: string;
  NODE_ENV?: string;
  AEREALITH_ENVIRONMENT?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_FLAGSHIP_APP_ID?: string;
  CLOUDFLARE_FLAGSHIP_AUTH_TOKEN?: string;
  AEREALITH_FLAGS_PROVIDER_NAME?: string;

  AUTH_TOKEN_SECRET?: string;
  AUTH_TOKEN_ISSUER?: string;
  AUTH_TOKEN_AUDIENCE?: string;

  AUTH_ACCESS_TOKEN_TTL_SECONDS?: string;
  AUTH_REFRESH_TOKEN_TTL_SECONDS?: string;
  AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS?: string;
  AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS?: string;
  AUTH_EMAIL_ENABLED?: string;

  AUTH_SESSION_TTL_SECONDS?: string;
  AUTH_REFRESH_TOKEN_ROTATION_ENABLED?: string;

  AUTH_REVOKE_EXISTING_VERIFICATION_TOKENS_ON_CREATE?: string;

  SERVICE_NAME?: string;
  SERVICE_VERSION?: string;
  PYROSCOPE_APPLICATION_NAME?: string;
  PYROSCOPE_SERVER_ADDRESS?: string;
  PYROSCOPE_BASIC_AUTH_USER?: string;
  PYROSCOPE_BASIC_AUTH_PASSWORD?: string;
};

export interface AuthWorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

let cachedAppPromise: Promise<Hono<AuthHonoEnv>> | undefined;
let cachedAppSignature: string | undefined;

const getAppSignature = (env: AuthWorkerBindings): string => {
  return JSON.stringify({
    AUTH_EMAIL_ENABLED: env.AUTH_EMAIL_ENABLED,
    AUTH_EMAIL_PROVIDER: env.AUTH_EMAIL_PROVIDER,
    AUTH_EMAIL_FROM: env.AUTH_EMAIL_FROM,
    AUTH_TOKEN_SECRET: env.AUTH_TOKEN_SECRET,
    AUTH_TOKEN_ISSUER: env.AUTH_TOKEN_ISSUER,
    AUTH_TOKEN_AUDIENCE: env.AUTH_TOKEN_AUDIENCE,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    AUTH_REFRESH_TOKEN_TTL_SECONDS: env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
    AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS:
      env.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
    AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS:
      env.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS,
    AUTH_SESSION_TTL_SECONDS: env.AUTH_SESSION_TTL_SECONDS,
    AUTH_REFRESH_TOKEN_ROTATION_ENABLED:
      env.AUTH_REFRESH_TOKEN_ROTATION_ENABLED,
    AUTH_REVOKE_EXISTING_VERIFICATION_TOKENS_ON_CREATE:
      env.AUTH_REVOKE_EXISTING_VERIFICATION_TOKENS_ON_CREATE,
    SERVICE_NAME: env.SERVICE_NAME,
    SERVICE_VERSION: env.SERVICE_VERSION,
  });
};

const startupOrmPromise = getOrm();

startupOrmPromise.catch(() => {
  // Keep health checks available when local database credentials are absent.
});

const getApp = async (env: AuthWorkerBindings): Promise<Hono<AuthHonoEnv>> => {
  const signature = getAppSignature(env);

  if (cachedAppPromise === undefined || cachedAppSignature !== signature) {
    cachedAppSignature = signature;
    cachedAppPromise = createConfiguredAuthApp(env);
  }

  return cachedAppPromise;
};

export default {
  async fetch(
    request: Request,
    env: AuthWorkerBindings,
    ctx: AuthWorkerExecutionContext,
  ): Promise<Response> {
    const telemetry = initServerTelemetry({
      service: env.SERVICE_NAME ?? AUTH_MAIN_DEFAULTS.serviceName,
      env: {
        NODE_ENV: env.NODE_ENV,
        TEMPO_API_TOKEN: env.TEMPO_API_TOKEN,
      },
      server: {
        token: env.TEMPO_API_TOKEN,
      },
    });
    const logger = createLogger({
      service: env.SERVICE_NAME ?? AUTH_MAIN_DEFAULTS.serviceName,
      env,
    });
    const requestContext = createRequestContextFromRequest(request, {
      service: env.SERVICE_NAME ?? AUTH_MAIN_DEFAULTS.serviceName,
    });
    const traceSession = createTraceSessionFromRequest(request, {
      service: env.SERVICE_NAME ?? AUTH_MAIN_DEFAULTS.serviceName,
    });
    const url = new URL(request.url);

    return runWithTraceSession(traceSession, async () =>
      runWithLogContext(requestContext, async () => {
        if (url.pathname === '/' || url.pathname === '/health') {
          const response = Response.json({
            success: true,
            data: {
              service: env.SERVICE_NAME ?? AUTH_MAIN_DEFAULTS.serviceName,
              status: 'ok',
              version: env.SERVICE_VERSION ?? AUTH_MAIN_DEFAULTS.serviceVersion,
              timestamp: new Date().toISOString(),
            },
          });

          logger.info('Auth health request completed', {
            success: true,
            tags: ['health'],
            metadata: {
              method: request.method,
              path: url.pathname,
              status: response.status,
            },
          });

          ctx.waitUntil(telemetry?.flush() ?? Promise.resolve());

          return withTraceSpan(
            'auth.health',
            {
              metadata: {
                method: request.method,
                path: url.pathname,
                status: response.status,
              },
              tags: ['auth', 'health'],
            },
            async () => response,
          );
        }

        const appPromise = getApp(env);

        // Timebox app initialization to avoid Cloudflare Worker "hung" requests.
        // If the auth app is still initializing (for example, waiting on DB),
        // return a 503 quickly so the runtime doesn't cancel the request.
        let app: Hono<AuthHonoEnv> | undefined;
        try {
          app = (await Promise.race([
            appPromise,
            new Promise<Hono<AuthHonoEnv> | undefined>((resolve) =>
              setTimeout(() => resolve(undefined), 1000),
            ),
          ])) as unknown as Hono<AuthHonoEnv> | undefined;
        } catch (e) {
          app = undefined;
        }

        if (!app) {
          const resp = Response.json(
            { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Auth service initializing. Try again shortly.' } },
            503,
          );

          logger.warn('Auth app not ready, returning 503', {
            metadata: { method: request.method, path: url.pathname },
            tags: ['auth', 'startup'],
          });

          ctx.waitUntil(telemetry?.flush() ?? Promise.resolve());

          return resp;
        }

        const response = await withTraceSpan(
          'auth.request',
          {
            metadata: {
              method: request.method,
              path: url.pathname,
            },
            tags: ['auth'],
          },
          async () => app.fetch(request, env, ctx as unknown as ExecutionContext),
        );

        logger.info('Auth worker request completed', {
          success: response.ok,
          failed: !response.ok,
          tags: [response.ok ? 'success' : 'failed'],
          metadata: {
            method: request.method,
            path: url.pathname,
            status: response.status,
          },
        });

        ctx.waitUntil(telemetry?.flush() ?? Promise.resolve());

        return response;
      }),
    );
  },
};

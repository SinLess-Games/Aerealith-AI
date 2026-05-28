import type { Context, Next } from 'hono';
import { SpanKind } from '@opentelemetry/api';

import { createTraceSessionFromRequest, runWithTraceSession } from './context';
import { withTraceSpan } from './tracer';

export type TraceHonoOptions = {
  service?: string;
};

export const createHonoTraceMiddleware = (options: TraceHonoOptions = {}) => {
  return async (context: Context, next: Next): Promise<Response | void> => {
    const session = createTraceSessionFromRequest(context.req.raw, {
      service: options.service ?? context.env?.SERVICE_NAME,
      metadata: {
        method: context.req.method,
        path: context.req.path,
      },
      tags: ['request'],
    });

    return runWithTraceSession(session, async () => {
      return withTraceSpan(
        `${context.req.method} ${context.req.path}`,
        {
          kind: SpanKind.SERVER,
          metadata: {
            method: context.req.method,
            path: context.req.path,
          },
          tags: ['request'],
        },
        async () => {
          await next();

          return context.res;
        },
      );
    });
  };
};

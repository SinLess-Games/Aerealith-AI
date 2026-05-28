import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Attributes, AttributeValue } from '@opentelemetry/api';

import {
  attachSpanToSession,
  createRootTraceSession,
  getCurrentTraceSession,
  runWithTraceSession,
} from './context';
import type { TraceCallback, TraceSession, TraceSpanOptions } from './types';

const getDefaultTracerName = (session: TraceSession): string => session.service ?? 'aerealith-tracer';

const toAttributeValue = (value: unknown): AttributeValue | undefined => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value == null) {
    return undefined;
  }

  return JSON.stringify(value);
};

const buildAttributes = (session: TraceSession, options: TraceSpanOptions = {}): Attributes => {
  const attributes: Attributes = {
    'service.name': session.service,
    'request.id': session.requestId,
    'app.tags': session.tags?.join(','),
    'app.labels': session.labels ? JSON.stringify(session.labels) : undefined,
  };

  for (const [key, value] of Object.entries(session.metadata ?? {})) {
    attributes[key] = toAttributeValue(value);
  }

  for (const [key, value] of Object.entries(options.metadata ?? {})) {
    attributes[key] = toAttributeValue(value);
  }

  for (const [key, value] of Object.entries(options.attributes ?? {})) {
    attributes[key] = value;
  }

  return attributes;
};

export const withTraceSpan = async <T>(
  name: string,
  options: TraceSpanOptions,
  callback: TraceCallback<T>,
): Promise<T> => {
  const parentSession = getCurrentTraceSession() ?? createRootTraceSession();

  const tracer = trace.getTracer(getDefaultTracerName(parentSession));
  const span = tracer.startSpan(name, {
    kind: options.kind ?? SpanKind.INTERNAL,
    attributes: buildAttributes(parentSession, options),
  }, parentSession.context);

  const session = attachSpanToSession(parentSession, span);

  return runWithTraceSession(session, async () => {
    try {
      const result = await callback(span, session);

      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Trace callback failed.',
      });

      throw error;
    } finally {
      span.end();
    }
  });
};

export const getCurrentTraceIds = (): { traceId?: string; spanId?: string } => {
  const session = getCurrentTraceSession();

  return {
    traceId: session?.traceId,
    spanId: session?.spanId,
  };
};

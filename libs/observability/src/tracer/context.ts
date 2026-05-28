import type { Context as OtelContext } from '@opentelemetry/api';
import { ROOT_CONTEXT, propagation, trace } from '@opentelemetry/api';

import { createRequestId, normalizeRequestId, tryRequireNodeModule } from '../logger/runtime';
import type { TraceSession } from './types';

const TRACE_STORAGE_KEY = Symbol.for('aerealith.observability.traceStorage');

type TraceStorageLike = {
  run: <T>(store: TraceSession, callback: () => T) => T;
  getStore: () => TraceSession | undefined;
};

type TraceGlobal = typeof globalThis & {
  [TRACE_STORAGE_KEY]?: TraceStorageLike;
};

const traceGetter = {
  get: (carrier: Headers, key: string): string | undefined => carrier.get(key) ?? undefined,
  keys: (): string[] => [],
};

const getTraceStorage = (): TraceStorageLike | undefined => {
  const globalRef = globalThis as TraceGlobal;

  if (globalRef[TRACE_STORAGE_KEY]) {
    return globalRef[TRACE_STORAGE_KEY];
  }

  try {
    const asyncHooks = tryRequireNodeModule<{ AsyncLocalStorage: new <T>() => TraceStorageLike }>(
      'node:async_hooks',
    );

    if (!asyncHooks?.AsyncLocalStorage) {
      return undefined;
    }

    const storage = new asyncHooks.AsyncLocalStorage<TraceSession>();

    globalRef[TRACE_STORAGE_KEY] = storage;

    return storage;
  } catch {
    return undefined;
  }
};

export const runWithTraceSession = <T>(session: TraceSession, callback: () => T): T => {
  const storage = getTraceStorage();

  if (!storage) {
    return callback();
  }

  return storage.run(session, callback);
};

export const getCurrentTraceSession = (): TraceSession | undefined => getTraceStorage()?.getStore();

export const createTraceSessionFromRequest = (
  request: Request,
  options: {
    requestId?: string;
    service?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
    labels?: Record<string, string>;
  } = {},
): TraceSession => {
  const requestId =
    normalizeRequestId(options.requestId) ??
    normalizeRequestId(request.headers.get('x-request-id') ?? undefined) ??
    normalizeRequestId(request.headers.get('x-correlation-id') ?? undefined) ??
    createRequestId();

  const parentContext = propagation.extract(ROOT_CONTEXT, request.headers, traceGetter);

  return {
    requestId,
    service: options.service?.trim(),
    context: parentContext,
    metadata: options.metadata,
    tags: options.tags,
    labels: options.labels,
  };
};

export const attachSpanToSession = (
  session: TraceSession,
  span: Parameters<typeof trace.setSpan>[1],
): TraceSession => {
  const spanContext = span.spanContext();

  return {
    ...session,
    context: trace.setSpan(session.context, span),
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
};

export const createRootTraceSession = (options: {
  requestId?: string;
  service?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  labels?: Record<string, string>;
} = {}): TraceSession => ({
  requestId: normalizeRequestId(options.requestId) ?? createRequestId(),
  service: options.service?.trim(),
  context: ROOT_CONTEXT as OtelContext,
  metadata: options.metadata,
  tags: options.tags,
  labels: options.labels,
});

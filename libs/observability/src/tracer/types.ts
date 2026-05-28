import type { Context, Span, SpanKind } from '@opentelemetry/api';

export type TraceAttributes = Record<string, string | number | boolean | undefined>;

export type TraceSession = {
  requestId: string;
  service?: string;
  context: Context;
  metadata?: Record<string, unknown>;
  tags?: string[];
  labels?: Record<string, string>;
  traceId?: string;
  spanId?: string;
};

export type TraceSpanOptions = {
  kind?: SpanKind;
  attributes?: TraceAttributes;
  metadata?: Record<string, unknown>;
  tags?: string[];
  labels?: Record<string, string>;
};

export type TraceCallback<T> = (span: Span, session: TraceSession) => T | Promise<T>;

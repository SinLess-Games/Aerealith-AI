import {
  HeaderName,
  getClientIp,
  getCloudflareCountry,
  getCloudflareRayId,
  getHeader,
  getRequestIdHeader,
  type HeaderSource,
} from '../headers/headers';
import { isErrorStatusCode } from '../http/status-codes';
import { createRequestId, normalizeRequestId } from '../request/request-id';
import { redactAuthorizationHeader } from '../auth/bearer-token';

/**
 * Structured request logging helpers for Helix API services.
 *
 * This file is framework-neutral:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 */

export const RequestLogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export type RequestLogLevel =
  (typeof RequestLogLevel)[keyof typeof RequestLogLevel];

export type RequestLogger = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;

export type RequestLogContext = {
  requestId: string;
  method: string;
  url: string;
  path: string;
  origin?: string;
  referer?: string;
  userAgent?: string;
  clientIp?: string;
  country?: string;
  cfRay?: string;
};

export type ResponseLogContext = RequestLogContext & {
  status: number;
  durationMs: number;
  ok: boolean;
};

export type RequestLogEntry = {
  timestamp: string;
  level: RequestLogLevel;
  event: string;
  requestId: string;
  method: string;
  url: string;
  path: string;
  status?: number;
  durationMs?: number;
  ok?: boolean;
  origin?: string;
  referer?: string;
  userAgent?: string;
  clientIp?: string;
  country?: string;
  cfRay?: string;
  message?: string;
  error?: SerializedLogError;
  metadata?: Record<string, unknown>;
};

export type SerializedLogError = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
};

export type CreateRequestLogContextOptions = {
  requestId?: string;
  includeQueryString?: boolean;
};

export type RequestLogOptions = {
  logger?: RequestLogger;
  level?: RequestLogLevel;
  event?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

export type ResponseLogOptions = RequestLogOptions & {
  error?: unknown;
};

export type RequestTimer = {
  startedAt: number;
  getDurationMs: () => number;
};

const DEFAULT_REQUEST_START_EVENT = 'http.request.start';

const DEFAULT_REQUEST_COMPLETE_EVENT = 'http.request.complete';

const DEFAULT_REQUEST_ERROR_EVENT = 'http.request.error';

const DEFAULT_LOGGER: RequestLogger = console;

export const nowMs = (): number => {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }

  return Date.now();
};

export const createRequestTimer = (): RequestTimer => {
  const startedAt = nowMs();

  return {
    startedAt,
    getDurationMs: () => roundDurationMs(nowMs() - startedAt),
  };
};

export const roundDurationMs = (durationMs: number): number =>
  Number(durationMs.toFixed(2));

export const getRequestPath = (
  request: Request,
  includeQueryString = false,
): string => {
  const url = new URL(request.url);

  if (!includeQueryString) {
    return url.pathname;
  }

  return `${url.pathname}${url.search}`;
};

export const createRequestLogContext = (
  request: Request,
  options: CreateRequestLogContextOptions = {},
): RequestLogContext => {
  const requestId =
    normalizeRequestId(options.requestId) ??
    normalizeRequestId(getRequestIdHeader(request.headers)) ??
    createRequestId();

  return {
    requestId,
    method: request.method.toUpperCase(),
    url: request.url,
    path: getRequestPath(request, options.includeQueryString ?? false),
    ...getOptionalRequestHeaderContext(request.headers),
  };
};

export const getOptionalRequestHeaderContext = (
  headers: HeaderSource,
): Omit<RequestLogContext, 'requestId' | 'method' | 'url' | 'path'> => {
  const origin = getHeader(headers, HeaderName.ORIGIN);
  const referer = getHeader(headers, HeaderName.REFERER);
  const userAgent = getHeader(headers, HeaderName.USER_AGENT);
  const clientIp = getClientIp(headers);
  const country = getCloudflareCountry(headers);
  const cfRay = getCloudflareRayId(headers);

  return {
    ...(origin ? { origin } : {}),
    ...(referer ? { referer } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(clientIp ? { clientIp } : {}),
    ...(country ? { country } : {}),
    ...(cfRay ? { cfRay } : {}),
  };
};

export const createRequestLogEntry = (
  context: RequestLogContext,
  options: RequestLogOptions = {},
): RequestLogEntry => ({
  timestamp: new Date().toISOString(),
  level: options.level ?? RequestLogLevel.INFO,
  event: options.event ?? DEFAULT_REQUEST_START_EVENT,
  requestId: context.requestId,
  method: context.method,
  url: context.url,
  path: context.path,
  ...(context.origin ? { origin: context.origin } : {}),
  ...(context.referer ? { referer: context.referer } : {}),
  ...(context.userAgent ? { userAgent: context.userAgent } : {}),
  ...(context.clientIp ? { clientIp: context.clientIp } : {}),
  ...(context.country ? { country: context.country } : {}),
  ...(context.cfRay ? { cfRay: context.cfRay } : {}),
  ...(options.message ? { message: options.message } : {}),
  ...(options.metadata
    ? { metadata: sanitizeLogMetadata(options.metadata) }
    : {}),
});

export const createResponseLogEntry = (
  context: ResponseLogContext,
  options: ResponseLogOptions = {},
): RequestLogEntry => {
  const level =
    options.level ??
    (context.status >= 500
      ? RequestLogLevel.ERROR
      : isErrorStatusCode(context.status)
        ? RequestLogLevel.WARN
        : RequestLogLevel.INFO);

  return {
    ...createRequestLogEntry(context, {
      ...options,
      level,
      event:
        options.event ??
        (context.ok
          ? DEFAULT_REQUEST_COMPLETE_EVENT
          : DEFAULT_REQUEST_ERROR_EVENT),
    }),
    status: context.status,
    durationMs: context.durationMs,
    ok: context.ok,
    ...(options.error ? { error: serializeLogError(options.error) } : {}),
  };
};

export const logRequestStart = (
  context: RequestLogContext,
  options: RequestLogOptions = {},
): RequestLogEntry => {
  const entry = createRequestLogEntry(context, {
    ...options,
    event: options.event ?? DEFAULT_REQUEST_START_EVENT,
  });

  writeLogEntry(entry, options.logger);

  return entry;
};

export const logRequestComplete = (
  context: ResponseLogContext,
  options: ResponseLogOptions = {},
): RequestLogEntry => {
  const entry = createResponseLogEntry(context, {
    ...options,
    event: options.event ?? DEFAULT_REQUEST_COMPLETE_EVENT,
  });

  writeLogEntry(entry, options.logger);

  return entry;
};

export const logRequestError = (
  context: ResponseLogContext,
  error: unknown,
  options: ResponseLogOptions = {},
): RequestLogEntry => {
  const entry = createResponseLogEntry(context, {
    ...options,
    level: options.level ?? RequestLogLevel.ERROR,
    event: options.event ?? DEFAULT_REQUEST_ERROR_EVENT,
    error,
  });

  writeLogEntry(entry, options.logger);

  return entry;
};

export const writeLogEntry = (
  entry: RequestLogEntry,
  logger: RequestLogger = DEFAULT_LOGGER,
): void => {
  const serializedEntry = JSON.stringify(entry);

  switch (entry.level) {
    case RequestLogLevel.DEBUG:
      logger.debug(serializedEntry);
      return;

    case RequestLogLevel.WARN:
      logger.warn(serializedEntry);
      return;

    case RequestLogLevel.ERROR:
      logger.error(serializedEntry);
      return;

    case RequestLogLevel.INFO:
    default:
      logger.info(serializedEntry);
  }
};

export const serializeLogError = (error: unknown): SerializedLogError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...('cause' in error && error.cause !== undefined
        ? { cause: sanitizeLogValue(error.cause) }
        : {}),
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
};

export const sanitizeLogMetadata = (
  metadata: Record<string, unknown>,
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    sanitized[key] = sanitizeLogValue(value, key);
  }

  return sanitized;
};

export const sanitizeLogValue = (value: unknown, key = ''): unknown => {
  const normalizedKey = key.toLowerCase();

  if (isSensitiveLogKey(normalizedKey)) {
    return '[redacted]';
  }

  if (typeof value === 'string') {
    if (normalizedKey === HeaderName.AUTHORIZATION.toLowerCase()) {
      return redactAuthorizationHeader(value) ?? '[redacted]';
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sanitizedRecord: Record<string, unknown> = {};

    for (const [recordKey, recordValue] of Object.entries(record)) {
      sanitizedRecord[recordKey] = sanitizeLogValue(recordValue, recordKey);
    }

    return sanitizedRecord;
  }

  return value;
};

export const isSensitiveLogKey = (key: string): boolean => {
  const normalizedKey = key.toLowerCase();

  return (
    normalizedKey.includes('authorization') ||
    normalizedKey.includes('cookie') ||
    normalizedKey.includes('token') ||
    normalizedKey.includes('secret') ||
    normalizedKey.includes('password') ||
    normalizedKey.includes('credential') ||
    normalizedKey.includes('api_key') ||
    normalizedKey.includes('apikey')
  );
};

import type { Context, MiddlewareHandler } from 'hono';

export const STRUCTURED_LOGGER_REQUEST_ID_HEADER = 'X-Request-Id' as const;

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type StructuredLogRequest = {
  id?: string;
  method: string;
  path: string;
  url: string;
  userAgent?: string;
  referer?: string;
  ip?: string;
};

export type StructuredLogResponse = {
  status: number;
  durationMs: number;
};

export type StructuredLogError = {
  name: string;
  message: string;
  stack?: string;
};

export type StructuredLogRecord = {
  timestamp: string;
  level: StructuredLogLevel;
  message: string;
  request: StructuredLogRequest;
  response: StructuredLogResponse;
  error?: StructuredLogError;
};

export type StructuredLogger = (
  record: StructuredLogRecord,
) => void | Promise<void>;

export type HonoStructuredLoggerMiddlewareOptions = {
  logger?: StructuredLogger;
  includeStack?: boolean;
  includeUrl?: boolean;
  requestIdHeader?: string;
  skip?: (c: Context) => boolean;
};

type StatusLikeError = Error & {
  status?: number;
  statusCode?: number;
};

const DEFAULT_REQUEST_ID_HEADER = STRUCTURED_LOGGER_REQUEST_ID_HEADER;

const isStatusLikeError = (error: unknown): error is StatusLikeError => {
  return error instanceof Error;
};

const isValidHttpStatus = (status: unknown): status is number => {
  return (
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
  );
};

const getRequestId = (c: Context, headerName: string): string | undefined => {
  const responseRequestId = c.res.headers.get(headerName);
  const requestRequestId = c.req.header(headerName);

  return responseRequestId ?? requestRequestId ?? undefined;
};

const getRequestIp = (c: Context): string | undefined => {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    c.req.header('X-Real-IP') ??
    undefined
  );
};

const getPath = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '/';
  }
};

const getRequestUrl = (url: string, includeUrl: boolean): string => {
  if (includeUrl) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);

    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return url;
  }
};

const getStatusFromError = (error: unknown): number => {
  if (!isStatusLikeError(error)) {
    return 500;
  }

  if (isValidHttpStatus(error.status)) {
    return error.status;
  }

  if (isValidHttpStatus(error.statusCode)) {
    return error.statusCode;
  }

  return 500;
};

const getResponseStatus = (c: Context, error: unknown): number => {
  if (error !== undefined) {
    const errorStatus = getStatusFromError(error);

    if (errorStatus >= 400) {
      return errorStatus;
    }
  }

  if (isValidHttpStatus(c.res.status)) {
    return c.res.status;
  }

  return 200;
};

const getLogLevel = (status: number): StructuredLogLevel => {
  if (status >= 500) {
    return 'error';
  }

  if (status >= 400) {
    return 'warn';
  }

  return 'info';
};

const getErrorRecord = (
  error: unknown,
  includeStack: boolean,
): StructuredLogError | undefined => {
  if (error === undefined) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(includeStack && error.stack ? { stack: error.stack } : {}),
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
};

const createConsoleLogger = (): StructuredLogger => {
  return (record) => {
    const output = JSON.stringify(record);

    if (record.level === 'error') {
      console.error(output);

      return;
    }

    if (record.level === 'warn') {
      console.warn(output);

      return;
    }

    if (record.level === 'debug') {
      console.debug(output);

      return;
    }

    console.info(output);
  };
};

const writeLog = async (
  logger: StructuredLogger,
  record: StructuredLogRecord,
): Promise<void> => {
  try {
    await logger(record);
  } catch (error) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Failed to write structured request log.',
        error: getErrorRecord(error, true),
      }),
    );
  }
};

const createLogRecord = (
  c: Context,
  startedAt: number,
  error: unknown,
  options: Required<
    Pick<
      HonoStructuredLoggerMiddlewareOptions,
      'includeStack' | 'includeUrl' | 'requestIdHeader'
    >
  >,
): StructuredLogRecord => {
  const durationMs = Date.now() - startedAt;
  const status = getResponseStatus(c, error);
  const method = c.req.method;
  const path = getPath(c.req.url);

  return {
    timestamp: new Date().toISOString(),
    level: getLogLevel(status),
    message: `${method} ${path} ${status} ${durationMs}ms`,
    request: {
      id: getRequestId(c, options.requestIdHeader),
      method,
      path,
      url: getRequestUrl(c.req.url, options.includeUrl),
      userAgent: c.req.header('User-Agent'),
      referer: c.req.header('Referer'),
      ip: getRequestIp(c),
    },
    response: {
      status,
      durationMs,
    },
    ...(error === undefined
      ? {}
      : { error: getErrorRecord(error, options.includeStack) }),
  };
};

export const honoStructuredLoggerMiddleware = (
  options: HonoStructuredLoggerMiddlewareOptions = {},
): MiddlewareHandler => {
  const logger = options.logger ?? createConsoleLogger();

  return async (c, next) => {
    if (options.skip?.(c) === true) {
      return await next();
    }

    const startedAt = Date.now();
    let caughtError: unknown;

    try {
      return await next();
    } catch (error) {
      caughtError = error;

      throw error;
    } finally {
      const record = createLogRecord(c, startedAt, caughtError, {
        includeStack: options.includeStack ?? false,
        includeUrl: options.includeUrl ?? false,
        requestIdHeader: options.requestIdHeader ?? DEFAULT_REQUEST_ID_HEADER,
      });

      await writeLog(logger, record);
    }
  };
};

export { honoStructuredLoggerMiddleware as structuredLoggerMiddleware };

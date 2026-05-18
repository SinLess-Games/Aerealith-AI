import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const ERROR_RESPONSE_HEADER = 'X-Error-Code' as const;
export const REQUEST_ID_HEADER = 'X-Request-Id' as const;

export type ErrorResponseBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId?: string;
    timestamp: string;
  };
};

export type ApiErrorLike = Error & {
  status?: number;
  statusCode?: number;
  code?: string;
  details?: unknown;
  expose?: boolean;
};

export type HonoErrorMiddlewareOptions = {
  includeDetails?: boolean;
  includeStack?: boolean;
  defaultMessage?: string;
  defaultCode?: string;
};

const DEFAULT_ERROR_CODE = 'INTERNAL_SERVER_ERROR';
const DEFAULT_ERROR_MESSAGE = 'Internal server error';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isApiErrorLike = (error: unknown): error is ApiErrorLike => {
  return isRecord(error);
};

const readStringProperty = (
  value: unknown,
  property: string,
): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const propertyValue = value[property];

  return typeof propertyValue === 'string' ? propertyValue : undefined;
};

const readBooleanProperty = (
  value: unknown,
  property: string,
): boolean | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const propertyValue = value[property];

  return typeof propertyValue === 'boolean' ? propertyValue : undefined;
};

const readNumberProperty = (
  value: unknown,
  property: string,
): number | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const propertyValue = value[property];

  return typeof propertyValue === 'number' ? propertyValue : undefined;
};

const normalizeStatus = (error: unknown): number => {
  if (error instanceof HTTPException) {
    return error.status;
  }

  if (!isApiErrorLike(error)) {
    return 500;
  }

  const status =
    readNumberProperty(error, 'status') ??
    readNumberProperty(error, 'statusCode');

  if (typeof status !== 'number') {
    return 500;
  }

  if (!Number.isInteger(status) || status < 400 || status > 599) {
    return 500;
  }

  return status;
};

const toContentfulStatusCode = (status: number): ContentfulStatusCode => {
  return status as ContentfulStatusCode;
};

const normalizeCode = (
  error: unknown,
  status: number,
  defaultCode: string,
): string => {
  if (
    isApiErrorLike(error) &&
    readStringProperty(error, 'code') !== undefined &&
    readStringProperty(error, 'code')?.trim()
  ) {
    return readStringProperty(error, 'code') as string;
  }

  if (error instanceof HTTPException) {
    return `HTTP_${error.status}`;
  }

  if (status >= 500) {
    return defaultCode;
  }

  return `HTTP_${status}`;
};

const shouldExposeMessage = (error: unknown, status: number): boolean => {
  if (status < 500) {
    return true;
  }

  if (readBooleanProperty(error, 'expose') === true) {
    return true;
  }

  return false;
};

const normalizeMessage = (
  error: unknown,
  status: number,
  defaultMessage: string,
): string => {
  if (!shouldExposeMessage(error, status)) {
    return defaultMessage;
  }

  if (error instanceof HTTPException) {
    return error.message || defaultMessage;
  }

  if (error instanceof Error) {
    return error.message || defaultMessage;
  }

  const message = readStringProperty(error, 'message');

  if (message !== undefined && message.trim()) {
    return message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return defaultMessage;
};

const getRequestId = (c: Context): string | undefined => {
  return (
    c.res.headers.get(REQUEST_ID_HEADER) ??
    c.req.header(REQUEST_ID_HEADER) ??
    undefined
  );
};

const getDetails = (
  error: unknown,
  includeDetails: boolean,
  includeStack: boolean,
): unknown => {
  if (!includeDetails) {
    return undefined;
  }

  if (isApiErrorLike(error) && 'details' in error) {
    return error.details;
  }

  if (includeStack && error instanceof Error) {
    return {
      name: error.name,
      stack: error.stack,
    };
  }

  return undefined;
};

export const createErrorResponseBody = (
  c: Context,
  error: unknown,
  options: HonoErrorMiddlewareOptions = {},
): ErrorResponseBody => {
  const status = normalizeStatus(error);
  const code = normalizeCode(
    error,
    status,
    options.defaultCode ?? DEFAULT_ERROR_CODE,
  );

  const details = getDetails(
    error,
    options.includeDetails ?? false,
    options.includeStack ?? false,
  );

  return {
    success: false,
    error: {
      code,
      message: normalizeMessage(
        error,
        status,
        options.defaultMessage ?? DEFAULT_ERROR_MESSAGE,
      ),
      ...(details === undefined ? {} : { details }),
    },
    meta: {
      requestId: getRequestId(c),
      timestamp: new Date().toISOString(),
    },
  };
};

export const honoErrorMiddleware = (
  options: HonoErrorMiddlewareOptions = {},
): MiddlewareHandler => {
  return async (c, next) => {
    try {
      return await next();
    } catch (error) {
      const status = normalizeStatus(error);
      const body = createErrorResponseBody(c, error, options);

      return c.json(body, {
        status: toContentfulStatusCode(status),
        headers: {
          [ERROR_RESPONSE_HEADER]: body.error.code,
        },
      });
    }
  };
};

export { honoErrorMiddleware as errorMiddleware };

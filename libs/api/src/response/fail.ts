import type {
  ApiErrorCode,
  ApiErrorDetails,
  ApiErrorResponse,
  ErrorResponseMeta,
} from '@helix-ai/contracts';
import { CommonErrorCode } from '@helix-ai/contracts';

import {
  HeaderName,
  HeaderValue,
  createJsonHeaders,
  mergeHeaders,
  setHeader,
  type HeaderSource,
} from '../headers/headers';
import {
  HttpStatusCode,
  type HttpStatusCode as HttpStatusCodeValue,
} from '../http/status-codes';
import { createRequestId, normalizeRequestId } from '../request/request-id';

/**
 * Error response helpers for Helix API services.
 *
 * These helpers are framework-neutral and can be used from Hono handlers,
 * Cloudflare Workers, tests, and service internals.
 */

export type FailOptions = {
  status?: HttpStatusCodeValue;
  requestId?: string;
  details?: ApiErrorDetails;
  meta?: ErrorResponseMeta;
  headers?: HeaderSource;
};

export type FailureBodyWithRequestId = ApiErrorResponse & {
  error: ApiErrorResponse['error'] & {
    requestId: string;
  };
  meta?: ErrorResponseMeta;
};

export type FailResult = {
  body: FailureBodyWithRequestId;
  status: HttpStatusCodeValue;
  headers: Headers;
};

export const getDefaultStatusForErrorCode = (
  code: ApiErrorCode,
): HttpStatusCodeValue => {
  switch (code) {
    case CommonErrorCode.BAD_REQUEST:
    case CommonErrorCode.VALIDATION_ERROR:
    case CommonErrorCode.INVALID_CONTENT_TYPE:
    case CommonErrorCode.INVALID_ORIGIN:
    case CommonErrorCode.BOT_CHECK_FAILED:
      return HttpStatusCode.BAD_REQUEST;

    case CommonErrorCode.UNAUTHORIZED:
      return HttpStatusCode.UNAUTHORIZED;

    case CommonErrorCode.FORBIDDEN:
      return HttpStatusCode.FORBIDDEN;

    case CommonErrorCode.NOT_FOUND:
      return HttpStatusCode.NOT_FOUND;

    case CommonErrorCode.METHOD_NOT_ALLOWED:
      return HttpStatusCode.METHOD_NOT_ALLOWED;

    case CommonErrorCode.CONFLICT:
      return HttpStatusCode.CONFLICT;

    case CommonErrorCode.PAYLOAD_TOO_LARGE:
      return HttpStatusCode.PAYLOAD_TOO_LARGE;

    case CommonErrorCode.UNSUPPORTED_MEDIA_TYPE:
      return HttpStatusCode.UNSUPPORTED_MEDIA_TYPE;

    case CommonErrorCode.RATE_LIMITED:
      return HttpStatusCode.TOO_MANY_REQUESTS;

    case CommonErrorCode.REQUEST_TIMEOUT:
      return HttpStatusCode.REQUEST_TIMEOUT;

    case CommonErrorCode.SERVICE_UNAVAILABLE:
      return HttpStatusCode.SERVICE_UNAVAILABLE;

    case CommonErrorCode.GATEWAY_TIMEOUT:
      return HttpStatusCode.GATEWAY_TIMEOUT;

    case CommonErrorCode.INTERNAL_ERROR:
    default:
      return HttpStatusCode.INTERNAL_SERVER_ERROR;
  }
};

export const createFailureBody = (
  code: ApiErrorCode,
  message: string,
  options: Pick<FailOptions, 'requestId' | 'details' | 'meta'> = {},
): FailureBodyWithRequestId => {
  const requestId = normalizeRequestId(options.requestId) ?? createRequestId();

  return {
    success: false,
    error: {
      code,
      message,
      requestId,
      ...(options.details === undefined ? {} : { details: options.details }),
    },
    ...(options.meta ? { meta: options.meta } : {}),
  };
};

export const fail = (
  code: ApiErrorCode,
  message: string,
  options: FailOptions = {},
): FailResult => {
  const body = createFailureBody(code, message, options);
  const status = options.status ?? getDefaultStatusForErrorCode(code);
  const headers = createJsonHeaders();

  setHeader(headers, HeaderName.X_REQUEST_ID, body.error.requestId);

  if (status === HttpStatusCode.UNAUTHORIZED) {
    setHeader(headers, HeaderName.WWW_AUTHENTICATE, HeaderValue.BEARER);
  }

  if (options.headers) {
    mergeHeaders(headers, options.headers);
  }

  return {
    body,
    status,
    headers,
  };
};

export const badRequest = (
  message = 'Bad request.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.BAD_REQUEST, message, {
    ...options,
    status: HttpStatusCode.BAD_REQUEST,
  });

export const validationError = (
  message = 'Validation failed.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.VALIDATION_ERROR, message, {
    ...options,
    status: HttpStatusCode.BAD_REQUEST,
  });

export const unauthorized = (
  message = 'Unauthorized.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.UNAUTHORIZED, message, {
    ...options,
    status: HttpStatusCode.UNAUTHORIZED,
  });

export const forbidden = (
  message = 'Forbidden.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.FORBIDDEN, message, {
    ...options,
    status: HttpStatusCode.FORBIDDEN,
  });

export const notFound = (
  message = 'Resource not found.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.NOT_FOUND, message, {
    ...options,
    status: HttpStatusCode.NOT_FOUND,
  });

export const methodNotAllowed = (
  message = 'Method not allowed.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.METHOD_NOT_ALLOWED, message, {
    ...options,
    status: HttpStatusCode.METHOD_NOT_ALLOWED,
  });

export const conflict = (
  message = 'Conflict.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.CONFLICT, message, {
    ...options,
    status: HttpStatusCode.CONFLICT,
  });

export const unsupportedMediaType = (
  message = 'Unsupported media type.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.UNSUPPORTED_MEDIA_TYPE, message, {
    ...options,
    status: HttpStatusCode.UNSUPPORTED_MEDIA_TYPE,
  });

export const rateLimited = (
  message = 'Too many requests.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.RATE_LIMITED, message, {
    ...options,
    status: HttpStatusCode.TOO_MANY_REQUESTS,
  });

export const internalError = (
  message = 'Internal server error.',
  options: Omit<FailOptions, 'status' | 'details'> = {},
): FailResult =>
  fail(CommonErrorCode.INTERNAL_ERROR, message, {
    ...options,
    status: HttpStatusCode.INTERNAL_SERVER_ERROR,
  });

export const serviceUnavailable = (
  message = 'Service unavailable.',
  options: Omit<FailOptions, 'status'> = {},
): FailResult =>
  fail(CommonErrorCode.SERVICE_UNAVAILABLE, message, {
    ...options,
    status: HttpStatusCode.SERVICE_UNAVAILABLE,
  });

export const toErrorResponse = (result: FailResult): Response =>
  new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });

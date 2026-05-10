import type {
  ApiErrorCode,
  ErrorResponseMeta,
  FieldValidationError,
} from '@helix-ai/contracts';
import { CommonErrorCode } from '@helix-ai/contracts';
import { ZodError, type ZodIssue } from 'zod';

import {
  ApiError,
  badRequestError,
  internalApiError,
  isApiError,
  validationApiError,
  type ApiErrorOptions,
} from './api-error';
import type { HeaderSource } from '../headers/headers';
import {
  HttpStatusCode,
  type HttpStatusCode as HttpStatusCodeValue,
} from '../http/status-codes';
import { fail, toErrorResponse, type FailResult } from '../response/fail';

/**
 * Error mapping helpers for Helix API services.
 *
 * This file converts unknown runtime errors into stable ApiError / FailResult /
 * Response values. It keeps internal errors private by default.
 */

export type ErrorMapperOptions = {
  code?: ApiErrorCode;
  status?: HttpStatusCodeValue;
  requestId?: string;
  meta?: ErrorResponseMeta;
  headers?: HeaderSource;
  fallbackMessage?: string;
  exposeUnknownErrors?: boolean;
};

export type UnknownErrorMapping = {
  apiError: ApiError;
  originalError: unknown;
};

const DEFAULT_INTERNAL_ERROR_MESSAGE = 'Internal server error.';

const DEFAULT_VALIDATION_ERROR_MESSAGE = 'Validation failed.';

export const zodIssueToFieldValidationError = (
  issue: ZodIssue,
): FieldValidationError => {
  const path = issue.path
    .map((segment) =>
      typeof segment === 'symbol' ? segment.toString() : segment,
    )
    .filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    );

  return {
    field: path.length > 0 ? path.join('.') : 'body',
    code: issue.code,
    message: issue.message,
    ...(path.length > 0 ? { path } : {}),
  };
};

export const zodErrorToFieldValidationErrors = (
  error: ZodError,
): FieldValidationError[] =>
  error.issues.map((issue) => zodIssueToFieldValidationError(issue));

export const isJsonSyntaxError = (error: unknown): error is SyntaxError =>
  error instanceof SyntaxError;

export const isAbortError = (error: unknown): boolean =>
  typeof DOMException !== 'undefined' &&
  error instanceof DOMException &&
  error.name === 'AbortError';

export const isTimeoutError = (error: unknown): boolean => {
  if (isAbortError(error)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedName = error.name.toLowerCase();
  const normalizedMessage = error.message.toLowerCase();

  return (
    normalizedName.includes('timeout') ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('timed out')
  );
};

export const mapUnknownErrorToApiError = (
  error: unknown,
  options: ErrorMapperOptions = {},
): ApiError => {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof ZodError) {
    return validationApiError(
      zodErrorToFieldValidationErrors(error),
      options.fallbackMessage ?? DEFAULT_VALIDATION_ERROR_MESSAGE,
      {
        requestId: options.requestId,
        meta: options.meta,
      },
    );
  }

  if (isJsonSyntaxError(error)) {
    return badRequestError('Invalid JSON request body.', {
      requestId: options.requestId,
      meta: options.meta,
      cause: error,
    });
  }

  if (isTimeoutError(error)) {
    return new ApiError('Request timed out.', {
      code: CommonErrorCode.REQUEST_TIMEOUT,
      status: HttpStatusCode.REQUEST_TIMEOUT,
      requestId: options.requestId,
      meta: options.meta,
      cause: error,
      expose: true,
    });
  }

  if (error instanceof Error) {
    return new ApiError(
      options.exposeUnknownErrors
        ? error.message
        : (options.fallbackMessage ?? DEFAULT_INTERNAL_ERROR_MESSAGE),
      {
        code: options.code ?? CommonErrorCode.INTERNAL_ERROR,
        status: options.status ?? HttpStatusCode.INTERNAL_SERVER_ERROR,
        requestId: options.requestId,
        meta: options.meta,
        cause: error,
        expose:
          options.exposeUnknownErrors ??
          (options.status !== undefined &&
            options.status < HttpStatusCode.INTERNAL_SERVER_ERROR),
      },
    );
  }

  return internalApiError(
    options.fallbackMessage ?? DEFAULT_INTERNAL_ERROR_MESSAGE,
    {
      requestId: options.requestId,
      meta: options.meta,
      cause: error,
    },
  );
};

export const mapUnknownError = (
  error: unknown,
  options: ErrorMapperOptions = {},
): UnknownErrorMapping => ({
  apiError: mapUnknownErrorToApiError(error, options),
  originalError: error,
});

export const mapUnknownErrorToFailResult = (
  error: unknown,
  options: ErrorMapperOptions = {},
): FailResult => {
  const apiError = mapUnknownErrorToApiError(error, options);

  return apiError.toFailResult({
    headers: options.headers,
    meta: options.meta,
  });
};

export const mapUnknownErrorToResponse = (
  error: unknown,
  options: ErrorMapperOptions = {},
): Response => toErrorResponse(mapUnknownErrorToFailResult(error, options));

export const createMappedFailResult = (
  code: ApiErrorCode,
  message: string,
  options: ErrorMapperOptions = {},
): FailResult =>
  fail(code, message, {
    status: options.status,
    requestId: options.requestId,
    meta: options.meta,
    headers: options.headers,
  });

export const createMappedApiError = (
  message: string,
  options: ApiErrorOptions = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: options.code ?? CommonErrorCode.INTERNAL_ERROR,
    status: options.status ?? HttpStatusCode.INTERNAL_SERVER_ERROR,
  });

export const getPublicErrorMessage = (
  error: unknown,
  fallbackMessage = DEFAULT_INTERNAL_ERROR_MESSAGE,
): string => {
  if (isApiError(error)) {
    return error.toJSON().message;
  }

  if (error instanceof ZodError) {
    return DEFAULT_VALIDATION_ERROR_MESSAGE;
  }

  if (isJsonSyntaxError(error)) {
    return 'Invalid JSON request body.';
  }

  if (isTimeoutError(error)) {
    return 'Request timed out.';
  }

  return fallbackMessage;
};

export const getErrorStatus = (
  error: unknown,
  fallbackStatus: HttpStatusCodeValue = HttpStatusCode.INTERNAL_SERVER_ERROR,
): HttpStatusCodeValue => {
  if (isApiError(error)) {
    return error.status;
  }

  if (error instanceof ZodError || isJsonSyntaxError(error)) {
    return HttpStatusCode.BAD_REQUEST;
  }

  if (isTimeoutError(error)) {
    return HttpStatusCode.REQUEST_TIMEOUT;
  }

  return fallbackStatus;
};

export const getErrorCode = (
  error: unknown,
  fallbackCode: ApiErrorCode = CommonErrorCode.INTERNAL_ERROR,
): ApiErrorCode => {
  if (isApiError(error)) {
    return error.code;
  }

  if (error instanceof ZodError) {
    return CommonErrorCode.VALIDATION_ERROR;
  }

  if (isJsonSyntaxError(error)) {
    return CommonErrorCode.BAD_REQUEST;
  }

  if (isTimeoutError(error)) {
    return CommonErrorCode.REQUEST_TIMEOUT;
  }

  return fallbackCode;
};

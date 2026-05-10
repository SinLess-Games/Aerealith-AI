import type {
  ApiErrorCode,
  ApiErrorDetails,
  ErrorResponseMeta,
  FieldValidationError,
} from '@helix-ai/contracts';
import { CommonErrorCode } from '@helix-ai/contracts';

import { fail, type FailOptions, type FailResult } from '../response/fail';
import {
  HttpStatusCode,
  type HttpStatusCode as HttpStatusCodeValue,
} from '../http/status-codes';
import { createRequestId, normalizeRequestId } from '../request/request-id';

/**
 * Runtime API error type for Helix API services.
 *
 * This class is framework-neutral:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 */

export type ApiErrorOptions = {
  code?: ApiErrorCode;
  status?: HttpStatusCodeValue;
  requestId?: string;
  details?: ApiErrorDetails;
  meta?: ErrorResponseMeta;
  cause?: unknown;
  expose?: boolean;
};

export type ApiErrorJson = {
  name: string;
  code: ApiErrorCode;
  message: string;
  status: HttpStatusCodeValue;
  requestId: string;
  details?: ApiErrorDetails;
  meta?: ErrorResponseMeta;
  expose: boolean;
};

export class ApiError extends Error {
  public readonly code: ApiErrorCode;

  public readonly status: HttpStatusCodeValue;

  public readonly requestId: string;

  public readonly details?: ApiErrorDetails;

  public readonly meta?: ErrorResponseMeta;

  public readonly expose: boolean;

  public override readonly cause?: unknown;

  public constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);

    this.name = 'ApiError';
    this.code = options.code ?? CommonErrorCode.INTERNAL_ERROR;
    this.status = options.status ?? HttpStatusCode.INTERNAL_SERVER_ERROR;
    this.requestId = normalizeRequestId(options.requestId) ?? createRequestId();
    this.expose =
      options.expose ?? this.status < HttpStatusCode.INTERNAL_SERVER_ERROR;

    if (options.details !== undefined) {
      this.details = options.details;
    }

    if (options.meta !== undefined) {
      this.meta = options.meta;
    }

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toFailResult(options: Omit<FailOptions, 'status'> = {}): FailResult {
    return fail(this.code, this.getPublicMessage(), {
      ...options,
      status: this.status,
      requestId: this.requestId,
      details: options.details ?? this.details,
      meta: options.meta ?? this.meta,
    });
  }

  public toResponse(options: Omit<FailOptions, 'status'> = {}): Response {
    const result = this.toFailResult(options);

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: result.headers,
    });
  }

  public toJSON(): ApiErrorJson {
    return {
      name: this.name,
      code: this.code,
      message: this.getPublicMessage(),
      status: this.status,
      requestId: this.requestId,
      ...(this.details === undefined ? {} : { details: this.details }),
      ...(this.meta === undefined ? {} : { meta: this.meta }),
      expose: this.expose,
    };
  }

  private getPublicMessage(): string {
    if (this.expose) {
      return this.message;
    }

    return 'Internal server error.';
  }
}

export const isApiError = (value: unknown): value is ApiError =>
  value instanceof ApiError;

export const toApiError = (
  error: unknown,
  fallbackMessage = 'Internal server error.',
  options: ApiErrorOptions = {},
): ApiError => {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError(options.expose ? error.message : fallbackMessage, {
      ...options,
      cause: error,
    });
  }

  return new ApiError(fallbackMessage, {
    ...options,
    cause: error,
  });
};

export const badRequestError = (
  message = 'Bad request.',
  options: Omit<ApiErrorOptions, 'code' | 'status'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.BAD_REQUEST,
    status: HttpStatusCode.BAD_REQUEST,
    expose: options.expose ?? true,
  });

export const validationApiError = (
  issues: FieldValidationError[],
  message = 'Validation failed.',
  options: Omit<ApiErrorOptions, 'code' | 'status' | 'details'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.VALIDATION_ERROR,
    status: HttpStatusCode.BAD_REQUEST,
    details: {
      issues,
    },
    expose: options.expose ?? true,
  });

export const unauthorizedError = (
  message = 'Unauthorized.',
  options: Omit<ApiErrorOptions, 'code' | 'status'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.UNAUTHORIZED,
    status: HttpStatusCode.UNAUTHORIZED,
    expose: options.expose ?? true,
  });

export const forbiddenError = (
  message = 'Forbidden.',
  options: Omit<ApiErrorOptions, 'code' | 'status'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.FORBIDDEN,
    status: HttpStatusCode.FORBIDDEN,
    expose: options.expose ?? true,
  });

export const notFoundError = (
  message = 'Resource not found.',
  options: Omit<ApiErrorOptions, 'code' | 'status'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.NOT_FOUND,
    status: HttpStatusCode.NOT_FOUND,
    expose: options.expose ?? true,
  });

export const conflictError = (
  message = 'Conflict.',
  options: Omit<ApiErrorOptions, 'code' | 'status'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.CONFLICT,
    status: HttpStatusCode.CONFLICT,
    expose: options.expose ?? true,
  });

export const unsupportedMediaTypeError = (
  message = 'Unsupported media type.',
  options: Omit<ApiErrorOptions, 'code' | 'status'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.UNSUPPORTED_MEDIA_TYPE,
    status: HttpStatusCode.UNSUPPORTED_MEDIA_TYPE,
    expose: options.expose ?? true,
  });

export const rateLimitedError = (
  message = 'Too many requests.',
  options: Omit<ApiErrorOptions, 'code' | 'status'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.RATE_LIMITED,
    status: HttpStatusCode.TOO_MANY_REQUESTS,
    expose: options.expose ?? true,
  });

export const internalApiError = (
  message = 'Internal server error.',
  options: Omit<ApiErrorOptions, 'code' | 'status' | 'expose'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.INTERNAL_ERROR,
    status: HttpStatusCode.INTERNAL_SERVER_ERROR,
    expose: false,
  });

export const serviceUnavailableError = (
  message = 'Service unavailable.',
  options: Omit<ApiErrorOptions, 'code' | 'status'> = {},
): ApiError =>
  new ApiError(message, {
    ...options,
    code: CommonErrorCode.SERVICE_UNAVAILABLE,
    status: HttpStatusCode.SERVICE_UNAVAILABLE,
    expose: options.expose ?? true,
  });

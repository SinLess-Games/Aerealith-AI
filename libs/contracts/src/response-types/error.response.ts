import type { ApiError, ApiErrorCode, ApiErrorDetails } from './api.response';

/**
 * Error response contracts shared across Helix services.
 *
 * These types are framework-agnostic and intentionally do not depend on
 * Hono, Cloudflare Workers, database entities, or frontend code.
 */

export type FieldValidationError = {
  field: string;
  code: string;
  message: string;
  path?: Array<string | number>;
  received?: unknown;
};

export type ValidationErrorDetails = {
  issues: FieldValidationError[];
};

export type ErrorResponseMeta = {
  timestamp?: string;
  service?: string;
  version?: string;
  environment?: string;
  path?: string;
  method?: string;
};

export type ErrorResponseBody<
  TDetails extends ApiErrorDetails = ApiErrorDetails,
> = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    requestId?: string;
    details?: TDetails;
  };
  meta?: ErrorResponseMeta;
};

export type ValidationErrorResponse = ErrorResponseBody<ValidationErrorDetails>;

export type UnauthorizedErrorResponse = ErrorResponseBody<{
  reason?:
    | 'missing_token'
    | 'invalid_token'
    | 'expired_token'
    | 'revoked_token';
}>;

export type ForbiddenErrorResponse = ErrorResponseBody<{
  requiredPermission?: string;
  requiredRole?: string;
  resource?: string;
}>;

export type RateLimitedErrorResponse = ErrorResponseBody<{
  limit?: number;
  remaining?: number;
  resetAt?: string;
  retryAfterSeconds?: number;
}>;

export type ConflictErrorResponse = ErrorResponseBody<{
  resource?: string;
  conflictField?: string;
}>;

export type ServiceUnavailableErrorResponse = ErrorResponseBody<{
  dependency?: string;
  retryAfterSeconds?: number;
}>;

export type AnyErrorResponse =
  | ErrorResponseBody
  | ValidationErrorResponse
  | UnauthorizedErrorResponse
  | ForbiddenErrorResponse
  | RateLimitedErrorResponse
  | ConflictErrorResponse
  | ServiceUnavailableErrorResponse;

export const createErrorResponse = <
  TDetails extends ApiErrorDetails = ApiErrorDetails,
>(
  error: ApiError & { details?: TDetails },
  meta?: ErrorResponseMeta,
): ErrorResponseBody<TDetails> => ({
  success: false,
  error: {
    code: error.code,
    message: error.message,
    ...(error.requestId ? { requestId: error.requestId } : {}),
    ...(error.details === undefined ? {} : { details: error.details }),
  },
  ...(meta ? { meta } : {}),
});

export const isErrorResponseBody = (
  value: unknown,
): value is ErrorResponseBody => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ErrorResponseBody>;

  return (
    candidate.success === false &&
    typeof candidate.error === 'object' &&
    candidate.error !== null &&
    typeof candidate.error.code === 'string' &&
    typeof candidate.error.message === 'string'
  );
};

export const hasValidationErrorDetails = (
  value: unknown,
): value is ValidationErrorDetails => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ValidationErrorDetails>;

  return (
    Array.isArray(candidate.issues) &&
    candidate.issues.every(
      (issue) =>
        typeof issue === 'object' &&
        issue !== null &&
        typeof issue.field === 'string' &&
        typeof issue.code === 'string' &&
        typeof issue.message === 'string',
    )
  );
};

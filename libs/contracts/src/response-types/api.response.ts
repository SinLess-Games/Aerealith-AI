import type { AuthErrorCode } from '../error-code-enums/auth-error-codes';
import type { CommonErrorCode } from '../error-code-enums/common-error-codes';
import type { UserErrorCode } from '../error-code-enums/user-error-codes';

/**
 * Canonical API response contract shared across Helix services.
 *
 * This file should stay framework-agnostic:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 * - no frontend imports
 */

export type ApiErrorCode = CommonErrorCode | AuthErrorCode | UserErrorCode;

export type ApiErrorDetails =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | boolean[]
  | Record<string, unknown>
  | Record<string, unknown>[];

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  requestId?: string;
  details?: ApiErrorDetails;
};

export type ApiSuccessResponse<TData = unknown> = {
  success: true;
  data: TData;
  requestId?: string;
  meta?: ApiResponseMeta;
};

export type ApiErrorResponse = {
  success: false;
  error: ApiError;
};

export type ApiResponse<TData = unknown> =
  | ApiSuccessResponse<TData>
  | ApiErrorResponse;

export type ApiResponseMeta = {
  timestamp?: string;
  service?: string;
  version?: string;
  environment?: string;
};

export type EmptyApiData = Record<string, never>;

export type EmptyApiResponse = ApiSuccessResponse<EmptyApiData>;

export type ApiHealthStatus = 'ok' | 'degraded' | 'error';

export type ApiHealthCheck = {
  name: string;
  status: ApiHealthStatus;
  message?: string;
  durationMs?: number;
  checkedAt?: string;
};

export type ApiHealthResponse = ApiSuccessResponse<{
  status: ApiHealthStatus;
  service: string;
  version?: string;
  checks: ApiHealthCheck[];
}>;

export const isApiErrorResponse = (
  value: unknown,
): value is ApiErrorResponse => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ApiErrorResponse>;

  return (
    candidate.success === false &&
    typeof candidate.error === 'object' &&
    candidate.error !== null &&
    typeof candidate.error.code === 'string' &&
    typeof candidate.error.message === 'string'
  );
};

export const isApiSuccessResponse = <TData = unknown>(
  value: unknown,
): value is ApiSuccessResponse<TData> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ApiSuccessResponse<TData>>;

  return candidate.success === true && 'data' in candidate;
};

export const isApiResponse = <TData = unknown>(
  value: unknown,
): value is ApiResponse<TData> =>
  isApiSuccessResponse<TData>(value) || isApiErrorResponse(value);

/**
 * Shared API error codes used across Helix services.
 *
 * Keep these codes stable. They are part of the public contract between
 * services, clients, tests, logs, and dashboards.
 */

export const CommonErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CONTENT_TYPE: 'INVALID_CONTENT_TYPE',
  INVALID_ORIGIN: 'INVALID_ORIGIN',
  RATE_LIMITED: 'RATE_LIMITED',
  BOT_CHECK_FAILED: 'BOT_CHECK_FAILED',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
} as const;

export type CommonErrorCode =
  (typeof CommonErrorCode)[keyof typeof CommonErrorCode];

export const COMMON_ERROR_CODES = Object.values(CommonErrorCode);

export const isCommonErrorCode = (value: unknown): value is CommonErrorCode =>
  typeof value === 'string' &&
  COMMON_ERROR_CODES.includes(value as CommonErrorCode);

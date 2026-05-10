/**
 * HTTP status code constants used by Helix API services.
 *
 * Keep this file dependency-free so it can be used by response helpers,
 * error mappers, middleware, and service code without creating import cycles.
 */

export const HttpStatusCode = {
  // 2xx Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // 3xx Redirection
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,

  // 4xx Client errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  NO_CHILL: 420,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,

  // 5xx Server errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type HttpStatusCode =
  (typeof HttpStatusCode)[keyof typeof HttpStatusCode];

export const HTTP_STATUS_CODES = Object.values(HttpStatusCode);

export const isHttpStatusCode = (value: unknown): value is HttpStatusCode =>
  typeof value === 'number' &&
  HTTP_STATUS_CODES.includes(value as HttpStatusCode);

export const isInformationalStatusCode = (statusCode: number): boolean =>
  statusCode >= 100 && statusCode <= 199;

export const isSuccessStatusCode = (statusCode: number): boolean =>
  statusCode >= 200 && statusCode <= 299;

export const isRedirectStatusCode = (statusCode: number): boolean =>
  statusCode >= 300 && statusCode <= 399;

export const isClientErrorStatusCode = (statusCode: number): boolean =>
  statusCode >= 400 && statusCode <= 499;

export const isServerErrorStatusCode = (statusCode: number): boolean =>
  statusCode >= 500 && statusCode <= 599;

export const isErrorStatusCode = (statusCode: number): boolean =>
  isClientErrorStatusCode(statusCode) || isServerErrorStatusCode(statusCode);

export * from './auth/bearer-token';

export * from './cors/cors-origin';

export * from './errors/api-error';
export * from './errors/auth.error';
export * from './errors/error-mapper';

export * from './headers/headers';

export * from './http/content-type';
export * from './http/status-codes';

export * from './logging/request-logger';

export * from './middleware/hono-cors.middleware';

export {
  ERROR_RESPONSE_HEADER,
  createErrorResponseBody,
  errorMiddleware,
  honoErrorMiddleware,
} from './middleware/hono-error.middleware';
export type {
  ApiErrorLike,
  ErrorResponseBody,
  HonoErrorMiddlewareOptions,
} from './middleware/hono-error.middleware';

export {
  REQUEST_ID_HEADER,
  REQUEST_ID_MAX_LENGTH,
  generateRequestId,
  honoRequestIdMiddleware,
  requestIdMiddleware,
} from './middleware/hono-request-id.middleware';
export type {
  HonoRequestIdGenerator,
  HonoRequestIdMiddlewareOptions,
  HonoRequestIdVariables,
} from './middleware/hono-request-id.middleware';

export * from './middleware/hono-structured-logger.middleware';

export * from './params';
export * from './routing';
export * from './validation';

export * from './response/fail';
export * from './response/ok';
export * from './response/paginated';

export * as requestId from './request/request-id';
import type { Context, MiddlewareHandler } from 'hono';
import { requestId } from 'hono/request-id';

export const REQUEST_ID_HEADER = 'X-Request-Id' as const;
export const REQUEST_ID_MAX_LENGTH = 255 as const;

export type HonoRequestIdVariables = {
  requestId: string;
};

export type HonoRequestIdGenerator = (c: Context) => string;

export type HonoRequestIdMiddlewareOptions = {
  /**
   * Header used to read/write the request id.
   *
   * Default: X-Request-Id
   */
  headerName?: string;

  /**
   * Maximum accepted request id length.
   *
   * Default: 255
   */
  limitLength?: number;

  /**
   * Custom request id generator used when the incoming request does not
   * already include a valid request id header.
   */
  generator?: HonoRequestIdGenerator;
};

export const generateRequestId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 12),
    Math.random().toString(36).slice(2, 12),
  ].join('-');
};

export const honoRequestIdMiddleware = (
  options: HonoRequestIdMiddlewareOptions = {},
): MiddlewareHandler => {
  return requestId({
    headerName: options.headerName ?? REQUEST_ID_HEADER,
    limitLength: options.limitLength ?? REQUEST_ID_MAX_LENGTH,
    generator: options.generator ?? generateRequestId,
  });
};

export { honoRequestIdMiddleware as requestIdMiddleware };

import type { ExecutionContext } from '@cloudflare/workers-types';

import { requestHeadersCloudflareMiddleware } from './request-headers.cloudflare-middleware';

export type CloudflareMiddlewareResult = {
  request?: Request;
  response?: Response;
};

export type CloudflareMiddleware<Env = unknown> = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) =>
  | CloudflareMiddlewareResult
  | Response
  | null
  | undefined
  | Promise<CloudflareMiddlewareResult | Response | null | undefined>;

export const cloudflareMiddlewares: CloudflareMiddleware[] = [
  requestHeadersCloudflareMiddleware,
];

export async function applyCloudflareMiddlewares<Env>(
  initialRequest: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<{ request: Request; response?: Response }> {
  let request = initialRequest;

  for (const middleware of cloudflareMiddlewares) {
    const result = await middleware(request, env, ctx);

    if (result instanceof Response) {
      return {
        request,
        response: result,
      };
    }

    if (result?.response) {
      return {
        request,
        response: result.response,
      };
    }

    if (result?.request) {
      request = result.request;
    }
  }

  return { request };
}
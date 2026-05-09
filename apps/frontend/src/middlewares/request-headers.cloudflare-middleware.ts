import type { CloudflareMiddleware } from './cloudflare-chain';

export const requestHeadersCloudflareMiddleware: CloudflareMiddleware = (
  request,
) => {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);

  headers.set('x-helix-pathname', url.pathname);
  headers.set('x-helix-method', request.method);
  headers.set('x-helix-edge-middleware', 'cloudflare-worker');

  return {
    request: new Request(request, {
      headers,
    }),
  };
};
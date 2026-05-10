import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

export const DEFAULT_CORS_ALLOW_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;

export const DEFAULT_CORS_ALLOW_HEADERS = [
  'Accept',
  'Authorization',
  'Content-Type',
  'X-Request-Id',
] as const;

export const DEFAULT_CORS_EXPOSE_HEADERS = [
  'X-Request-Id',
  'X-Error-Code',
] as const;

type HonoCorsOptions = NonNullable<Parameters<typeof cors>[0]>;

export type HonoCorsOrigin = NonNullable<HonoCorsOptions['origin']>;

export type HonoCorsMiddlewareOptions = Omit<
  HonoCorsOptions,
  'allowMethods' | 'allowHeaders' | 'exposeHeaders'
> & {
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
};

export const createCorsOrigin = (
  allowedOrigins: readonly string[] = [],
): HonoCorsOrigin => {
  if (allowedOrigins.length === 0) {
    return '*';
  }

  return (origin) => {
    if (!origin) {
      return null;
    }

    if (allowedOrigins.includes(origin)) {
      return origin;
    }

    return null;
  };
};

export const honoCorsMiddleware = (
  options: HonoCorsMiddlewareOptions = {},
): MiddlewareHandler => {
  return cors({
    origin: options.origin ?? '*',
    allowMethods: options.allowMethods ?? [...DEFAULT_CORS_ALLOW_METHODS],
    allowHeaders: options.allowHeaders ?? [...DEFAULT_CORS_ALLOW_HEADERS],
    exposeHeaders: options.exposeHeaders ?? [...DEFAULT_CORS_EXPOSE_HEADERS],
    maxAge: options.maxAge ?? 86_400,
    credentials: options.credentials ?? false,
  });
};

export { honoCorsMiddleware as corsMiddleware };

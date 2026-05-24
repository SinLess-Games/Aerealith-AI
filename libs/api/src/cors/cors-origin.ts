import { CommonErrorCode } from '@aerealith-ai/contracts';

import {
  HeaderName,
  appendVaryHeader,
  getHeader,
  mergeHeaders,
  setHeader,
  type HeaderSource,
} from '../headers/headers';
import { HttpStatusCode } from '../http/status-codes';
import { fail, toErrorResponse, type FailResult } from '../response/fail';

/**
 * CORS origin helpers for Helix API services.
 *
 * This file is framework-neutral:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 */

export const CorsHeaderName = {
  ACCESS_CONTROL_ALLOW_ORIGIN: 'Access-Control-Allow-Origin',
  ACCESS_CONTROL_ALLOW_METHODS: 'Access-Control-Allow-Methods',
  ACCESS_CONTROL_ALLOW_HEADERS: 'Access-Control-Allow-Headers',
  ACCESS_CONTROL_ALLOW_CREDENTIALS: 'Access-Control-Allow-Credentials',
  ACCESS_CONTROL_EXPOSE_HEADERS: 'Access-Control-Expose-Headers',
  ACCESS_CONTROL_MAX_AGE: 'Access-Control-Max-Age',
  ACCESS_CONTROL_REQUEST_METHOD: 'Access-Control-Request-Method',
  ACCESS_CONTROL_REQUEST_HEADERS: 'Access-Control-Request-Headers',
} as const;

export type CorsHeaderName =
  (typeof CorsHeaderName)[keyof typeof CorsHeaderName];

export const DEFAULT_CORS_ALLOWED_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;

export const DEFAULT_CORS_ALLOWED_HEADERS = [
  HeaderName.AUTHORIZATION,
  HeaderName.CONTENT_TYPE,
  HeaderName.X_REQUEST_ID,
  HeaderName.X_CORRELATION_ID,
] as const;

export const DEFAULT_CORS_EXPOSED_HEADERS = [
  HeaderName.X_REQUEST_ID,
  HeaderName.X_CORRELATION_ID,
  HeaderName.CF_RAY,
] as const;

export const DEFAULT_CORS_MAX_AGE_SECONDS = 86_400;

export type CorsOriginMatcher = string | RegExp | ((origin: string) => boolean);

export type CorsOptions = {
  allowedOrigins: readonly CorsOriginMatcher[];
  allowedMethods?: readonly string[];
  allowedHeaders?: readonly string[];
  exposedHeaders?: readonly string[];
  allowCredentials?: boolean;
  maxAgeSeconds?: number;
};

export type CorsOriginResult =
  | {
      allowed: true;
      origin: string;
    }
  | {
      allowed: false;
      origin?: string;
      reason: 'missing_origin' | 'invalid_origin' | 'origin_not_allowed';
    };

export const normalizeOrigin = (
  origin: string | null | undefined,
): string | undefined => {
  if (!origin) {
    return undefined;
  }

  const normalized = origin.trim();

  if (!normalized || normalized.toLowerCase() === 'null') {
    return undefined;
  }

  try {
    const url = new URL(normalized);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
};

export const isWildcardOriginAllowed = (
  allowedOrigins: readonly CorsOriginMatcher[],
): boolean => allowedOrigins.some((origin) => origin === '*');

export const originMatches = (
  origin: string,
  matcher: CorsOriginMatcher,
): boolean => {
  if (matcher === '*') {
    return true;
  }

  if (typeof matcher === 'string') {
    return normalizeOrigin(matcher) === origin;
  }

  if (matcher instanceof RegExp) {
    return matcher.test(origin);
  }

  return matcher(origin);
};

export const isOriginAllowed = (
  origin: string,
  allowedOrigins: readonly CorsOriginMatcher[],
): boolean => allowedOrigins.some((matcher) => originMatches(origin, matcher));

export const getRequestOrigin = (headers: HeaderSource): string | undefined =>
  normalizeOrigin(getHeader(headers, HeaderName.ORIGIN));

export const resolveCorsOrigin = (
  headers: HeaderSource,
  options: CorsOptions,
): CorsOriginResult => {
  const originHeader = getHeader(headers, HeaderName.ORIGIN);

  if (!originHeader) {
    return {
      allowed: false,
      reason: 'missing_origin',
    };
  }

  const origin = normalizeOrigin(originHeader);

  if (!origin) {
    return {
      allowed: false,
      origin: originHeader,
      reason: 'invalid_origin',
    };
  }

  if (isOriginAllowed(origin, options.allowedOrigins)) {
    return {
      allowed: true,
      origin,
    };
  }

  return {
    allowed: false,
    origin,
    reason: 'origin_not_allowed',
  };
};

export const createCorsHeaders = (
  origin: string,
  options: CorsOptions,
): Headers => {
  const headers = new Headers();
  const allowCredentials = options.allowCredentials ?? false;
  const allowWildcard =
    !allowCredentials && isWildcardOriginAllowed(options.allowedOrigins);

  setHeader(
    headers,
    CorsHeaderName.ACCESS_CONTROL_ALLOW_ORIGIN,
    allowWildcard ? '*' : origin,
  );

  setHeader(
    headers,
    CorsHeaderName.ACCESS_CONTROL_ALLOW_METHODS,
    (options.allowedMethods ?? DEFAULT_CORS_ALLOWED_METHODS).join(', '),
  );

  setHeader(
    headers,
    CorsHeaderName.ACCESS_CONTROL_ALLOW_HEADERS,
    (options.allowedHeaders ?? DEFAULT_CORS_ALLOWED_HEADERS).join(', '),
  );

  setHeader(
    headers,
    CorsHeaderName.ACCESS_CONTROL_EXPOSE_HEADERS,
    (options.exposedHeaders ?? DEFAULT_CORS_EXPOSED_HEADERS).join(', '),
  );

  setHeader(
    headers,
    CorsHeaderName.ACCESS_CONTROL_MAX_AGE,
    options.maxAgeSeconds ?? DEFAULT_CORS_MAX_AGE_SECONDS,
  );

  if (allowCredentials) {
    setHeader(headers, CorsHeaderName.ACCESS_CONTROL_ALLOW_CREDENTIALS, 'true');
  }

  if (!allowWildcard) {
    appendVaryHeader(headers, HeaderName.ORIGIN);
  }

  return headers;
};

export const applyCorsHeaders = (
  headers: Headers,
  origin: string,
  options: CorsOptions,
): Headers => {
  mergeHeaders(headers, createCorsHeaders(origin, options));
  return headers;
};

export const isCorsPreflightRequest = (request: Request): boolean =>
  request.method.toUpperCase() === 'OPTIONS' &&
  request.headers.has(HeaderName.ORIGIN) &&
  request.headers.has(CorsHeaderName.ACCESS_CONTROL_REQUEST_METHOD);

export const createCorsPreflightResponse = (
  request: Request,
  options: CorsOptions,
): Response => {
  const resolvedOrigin = resolveCorsOrigin(request.headers, options);

  if (!resolvedOrigin.allowed) {
    return toErrorResponse(
      createInvalidOriginFailResult(resolvedOrigin.origin, {
        details: {
          reason: resolvedOrigin.reason,
        },
      }),
    );
  }

  return new Response(null, {
    status: HttpStatusCode.NO_CONTENT,
    headers: createCorsHeaders(resolvedOrigin.origin, options),
  });
};

export const createInvalidOriginFailResult = (
  origin?: string,
  options: {
    requestId?: string;
    details?: Record<string, unknown>;
  } = {},
): FailResult =>
  fail(CommonErrorCode.INVALID_ORIGIN, 'Origin is not allowed.', {
    status: HttpStatusCode.FORBIDDEN,
    requestId: options.requestId,
    details: {
      ...(origin ? { origin } : {}),
      ...(options.details ?? {}),
    },
  });

export const createInvalidOriginResponse = (
  origin?: string,
  options: {
    requestId?: string;
    details?: Record<string, unknown>;
  } = {},
): Response => toErrorResponse(createInvalidOriginFailResult(origin, options));

export const assertCorsOriginAllowed = (
  request: Request,
  options: CorsOptions,
): CorsOriginResult => resolveCorsOrigin(request.headers, options);

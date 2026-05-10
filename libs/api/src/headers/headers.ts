/**
 * Shared HTTP header constants and helpers for Helix API services.
 *
 * Keep this file dependency-free so it can be used by response helpers,
 * CORS helpers, auth helpers, logging, middleware, and services without
 * creating import cycles.
 */

export const HeaderName = {
  ACCEPT: 'Accept',
  ACCEPT_ENCODING: 'Accept-Encoding',
  ACCEPT_LANGUAGE: 'Accept-Language',
  AUTHORIZATION: 'Authorization',
  CACHE_CONTROL: 'Cache-Control',
  CDN_LOOP: 'CDN-Loop',
  CF_CONNECTING_IP: 'CF-Connecting-IP',
  CF_CONNECTING_IPV6: 'CF-Connecting-IPv6',
  CF_IP_COUNTRY: 'CF-IPCountry',
  CF_RAY: 'CF-Ray',
  CF_VISITOR: 'CF-Visitor',
  CF_WORKER: 'CF-Worker',
  CONTENT_LENGTH: 'Content-Length',
  CONTENT_TYPE: 'Content-Type',
  COOKIE: 'Cookie',
  HOST: 'Host',
  LOCATION: 'Location',
  ORIGIN: 'Origin',
  REFERER: 'Referer',
  RETRY_AFTER: 'Retry-After',
  SET_COOKIE: 'Set-Cookie',
  USER_AGENT: 'User-Agent',
  VARY: 'Vary',
  WWW_AUTHENTICATE: 'WWW-Authenticate',
  X_CONTENT_TYPE_OPTIONS: 'X-Content-Type-Options',
  X_CORRELATION_ID: 'X-Correlation-Id',
  X_FORWARDED_FOR: 'X-Forwarded-For',
  X_FORWARDED_HOST: 'X-Forwarded-Host',
  X_FORWARDED_PROTO: 'X-Forwarded-Proto',
  X_REAL_IP: 'X-Real-IP',
  X_REQUEST_ID: 'X-Request-Id',
} as const;

export type HeaderName = (typeof HeaderName)[keyof typeof HeaderName];

export const HeaderValue = {
  APPLICATION_JSON: 'application/json',
  APPLICATION_JSON_UTF8: 'application/json; charset=utf-8',
  TEXT_PLAIN_UTF8: 'text/plain; charset=utf-8',

  BEARER: 'Bearer',

  CACHE_NO_STORE: 'no-store',
  CACHE_NO_CACHE: 'no-cache',
  CACHE_PRIVATE_NO_STORE: 'private, no-store',

  NOSNIFF: 'nosniff',

  VARY_ORIGIN: 'Origin',
  VARY_ACCEPT_ENCODING: 'Accept-Encoding',
} as const;

export type HeaderValue = (typeof HeaderValue)[keyof typeof HeaderValue];

export type HeaderRecord = Record<
  string,
  string | readonly string[] | number | boolean | null | undefined
>;

export type HeaderSource = Headers | HeaderRecord;

export const isHeadersInstance = (value: unknown): value is Headers =>
  typeof Headers !== 'undefined' && value instanceof Headers;

export const normalizeHeaderName = (name: string): string =>
  name.trim().toLowerCase();

export const getHeader = (
  headers: HeaderSource,
  name: HeaderName | string,
): string | undefined => {
  if (isHeadersInstance(headers)) {
    return headers.get(name) ?? undefined;
  }

  const normalizedName = normalizeHeaderName(name);

  for (const [key, value] of Object.entries(headers)) {
    if (normalizeHeaderName(key) !== normalizedName) {
      continue;
    }

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    if (value === null || value === undefined) {
      return undefined;
    }

    return String(value);
  }

  return undefined;
};

export const hasHeader = (
  headers: HeaderSource,
  name: HeaderName | string,
): boolean => getHeader(headers, name) !== undefined;

export const setHeader = (
  headers: Headers,
  name: HeaderName | string,
  value: string | number | boolean,
): Headers => {
  headers.set(name, String(value));
  return headers;
};

export const appendHeader = (
  headers: Headers,
  name: HeaderName | string,
  value: string | number | boolean,
): Headers => {
  headers.append(name, String(value));
  return headers;
};

export const deleteHeader = (
  headers: Headers,
  name: HeaderName | string,
): Headers => {
  headers.delete(name);
  return headers;
};

export const createJsonHeaders = (extraHeaders?: HeaderRecord): Headers => {
  const headers = new Headers();

  headers.set(HeaderName.CONTENT_TYPE, HeaderValue.APPLICATION_JSON_UTF8);
  headers.set(HeaderName.CACHE_CONTROL, HeaderValue.CACHE_NO_STORE);
  headers.set(HeaderName.X_CONTENT_TYPE_OPTIONS, HeaderValue.NOSNIFF);

  if (extraHeaders) {
    mergeHeaders(headers, extraHeaders);
  }

  return headers;
};

export const mergeHeaders = (
  target: Headers,
  source: HeaderSource,
): Headers => {
  if (isHeadersInstance(source)) {
    source.forEach((value, key) => {
      target.set(key, value);
    });

    return target;
  }

  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      target.set(key, value.join(', '));
      continue;
    }

    target.set(key, String(value));
  }

  return target;
};

export const appendVaryHeader = (headers: Headers, value: string): Headers => {
  const current = headers.get(HeaderName.VARY);

  if (!current) {
    headers.set(HeaderName.VARY, value);
    return headers;
  }

  const existingValues = current
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!existingValues.includes(value.trim().toLowerCase())) {
    headers.set(HeaderName.VARY, `${current}, ${value}`);
  }

  return headers;
};

export const getBearerTokenFromAuthorizationHeader = (
  authorizationHeader: string | null | undefined,
): string | undefined => {
  if (!authorizationHeader) {
    return undefined;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (scheme?.toLowerCase() !== HeaderValue.BEARER.toLowerCase() || !token) {
    return undefined;
  }

  return token;
};

export const getBearerToken = (headers: HeaderSource): string | undefined =>
  getBearerTokenFromAuthorizationHeader(
    getHeader(headers, HeaderName.AUTHORIZATION),
  );

export const getRequestIdHeader = (headers: HeaderSource): string | undefined =>
  getHeader(headers, HeaderName.X_REQUEST_ID) ??
  getHeader(headers, HeaderName.X_CORRELATION_ID);

export const getCloudflareRayId = (headers: HeaderSource): string | undefined =>
  getHeader(headers, HeaderName.CF_RAY);

export const getCloudflareCountry = (
  headers: HeaderSource,
): string | undefined => getHeader(headers, HeaderName.CF_IP_COUNTRY);

export const getClientIp = (headers: HeaderSource): string | undefined => {
  const cfConnectingIp = getHeader(headers, HeaderName.CF_CONNECTING_IP);

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const xRealIp = getHeader(headers, HeaderName.X_REAL_IP);

  if (xRealIp) {
    return xRealIp;
  }

  const xForwardedFor = getHeader(headers, HeaderName.X_FORWARDED_FOR);

  if (!xForwardedFor) {
    return undefined;
  }

  return xForwardedFor.split(',').at(0)?.trim() || undefined;
};

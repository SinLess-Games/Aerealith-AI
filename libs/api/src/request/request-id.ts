import {
  HeaderName,
  getRequestIdHeader,
  setHeader,
  type HeaderSource,
} from '../headers/headers';

/**
 * Request ID helpers for Helix API services.
 *
 * Request IDs are not secrets. They exist for tracing, logs, errors,
 * response headers, and cross-service correlation.
 */

export const REQUEST_ID_HEADER = HeaderName.X_REQUEST_ID;

export const CORRELATION_ID_HEADER = HeaderName.X_CORRELATION_ID;

export const REQUEST_ID_MAX_LENGTH = 128;

export const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;

export type RequestIdHeaderName =
  | typeof HeaderName.X_REQUEST_ID
  | typeof HeaderName.X_CORRELATION_ID;

export type RequestIdOptions = {
  headerName?: RequestIdHeaderName;
  fallbackToCorrelationId?: boolean;
};

export const isValidRequestId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= REQUEST_ID_MAX_LENGTH &&
  REQUEST_ID_PATTERN.test(value.trim());

export const normalizeRequestId = (
  value: string | null | undefined,
): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  return isValidRequestId(normalized) ? normalized : undefined;
};

export const createRequestId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);

    globalThis.crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  }

  return `req_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 12)}`;
};

export const getRequestIdFromHeaders = (
  headers: HeaderSource,
  options: RequestIdOptions = {},
): string | undefined => {
  const headerName = options.headerName ?? HeaderName.X_REQUEST_ID;
  const fallbackToCorrelationId = options.fallbackToCorrelationId ?? true;

  const primaryRequestId = normalizeRequestId(
    headerName === HeaderName.X_REQUEST_ID
      ? getRequestIdHeader(headers)
      : undefined,
  );

  if (primaryRequestId) {
    return primaryRequestId;
  }

  if (!fallbackToCorrelationId) {
    return undefined;
  }

  return normalizeRequestId(getRequestIdHeader(headers));
};

export const getRequestIdFromRequest = (
  request: Request,
  options?: RequestIdOptions,
): string | undefined => getRequestIdFromHeaders(request.headers, options);

export const getOrCreateRequestIdFromHeaders = (
  headers: HeaderSource,
  options?: RequestIdOptions,
): string => getRequestIdFromHeaders(headers, options) ?? createRequestId();

export const getOrCreateRequestIdFromRequest = (
  request: Request,
  options?: RequestIdOptions,
): string => getRequestIdFromRequest(request, options) ?? createRequestId();

export const setRequestIdHeader = (
  headers: Headers,
  requestId: string,
  headerName: RequestIdHeaderName = HeaderName.X_REQUEST_ID,
): Headers => {
  const normalizedRequestId = normalizeRequestId(requestId);

  if (!normalizedRequestId) {
    return headers;
  }

  return setHeader(headers, headerName, normalizedRequestId);
};

export const createRequestIdHeaders = (
  requestId: string = createRequestId(),
): Headers => {
  const headers = new Headers();

  setRequestIdHeader(headers, requestId);

  return headers;
};

export const ensureRequestIdHeader = (
  headers: Headers,
  requestId?: string,
): string => {
  const resolvedRequestId =
    normalizeRequestId(requestId) ??
    normalizeRequestId(headers.get(HeaderName.X_REQUEST_ID)) ??
    createRequestId();

  setRequestIdHeader(headers, resolvedRequestId);

  return resolvedRequestId;
};

export const cloneRequestWithRequestId = (
  request: Request,
  requestId: string = getOrCreateRequestIdFromRequest(request),
): Request => {
  const headers = new Headers(request.headers);

  setRequestIdHeader(headers, requestId);

  return new Request(request, {
    headers,
  });
};

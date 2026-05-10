import type { ApiResponseMeta, ApiSuccessResponse } from '@helix-ai/contracts';

import {
  HeaderName,
  createJsonHeaders,
  mergeHeaders,
  setHeader,
  type HeaderRecord,
  type HeaderSource,
} from '../headers/headers';
import {
  HttpStatusCode,
  type HttpStatusCode as HttpStatusCodeValue,
} from '../http/status-codes';
import { createRequestId, normalizeRequestId } from '../request/request-id';

/**
 * Success response helpers for Helix API services.
 *
 * These helpers are framework-neutral and can be used from Hono handlers,
 * Cloudflare Workers, tests, and service internals.
 */

export type OkOptions = {
  status?: HttpStatusCodeValue;
  requestId?: string;
  meta?: ApiResponseMeta;
  headers?: HeaderSource;
};

export type SuccessBodyWithRequestId<TData> = ApiSuccessResponse<TData> & {
  requestId: string;
};

export type OkResult<TData> = {
  body: SuccessBodyWithRequestId<TData>;
  status: HttpStatusCodeValue;
  headers: Headers;
};

export const createSuccessBody = <TData>(
  data: TData,
  options: Pick<OkOptions, 'requestId' | 'meta'> = {},
): SuccessBodyWithRequestId<TData> => {
  const requestId = normalizeRequestId(options.requestId) ?? createRequestId();

  return {
    success: true,
    data,
    requestId,
    ...(options.meta ? { meta: options.meta } : {}),
  };
};

export const ok = <TData>(
  data: TData,
  options: OkOptions = {},
): OkResult<TData> => {
  const status = options.status ?? HttpStatusCode.OK;
  const body = createSuccessBody(data, options);
  const headers = createJsonHeaders();

  setHeader(headers, HeaderName.X_REQUEST_ID, body.requestId);

  if (options.headers) {
    mergeHeaders(headers, options.headers);
  }

  return {
    body,
    status,
    headers,
  };
};

export const created = <TData>(
  data: TData,
  options: Omit<OkOptions, 'status'> = {},
): OkResult<TData> =>
  ok(data, {
    ...options,
    status: HttpStatusCode.CREATED,
  });

export const accepted = <TData>(
  data: TData,
  options: Omit<OkOptions, 'status'> = {},
): OkResult<TData> =>
  ok(data, {
    ...options,
    status: HttpStatusCode.ACCEPTED,
  });

export const noContent = (
  options: Omit<OkOptions, 'status' | 'meta'> = {},
): {
  body: null;
  status: typeof HttpStatusCode.NO_CONTENT;
  headers: Headers;
} => {
  const requestId = normalizeRequestId(options.requestId) ?? createRequestId();
  const headers = new Headers();

  setHeader(headers, HeaderName.X_REQUEST_ID, requestId);
  setHeader(headers, HeaderName.CACHE_CONTROL, 'no-store');
  setHeader(headers, HeaderName.X_CONTENT_TYPE_OPTIONS, 'nosniff');

  if (options.headers) {
    mergeHeaders(headers, options.headers);
  }

  return {
    body: null,
    status: HttpStatusCode.NO_CONTENT,
    headers,
  };
};

export const redirect = (
  location: string,
  status:
    | typeof HttpStatusCode.FOUND
    | typeof HttpStatusCode.SEE_OTHER
    | typeof HttpStatusCode.TEMPORARY_REDIRECT
    | typeof HttpStatusCode.PERMANENT_REDIRECT = HttpStatusCode.FOUND,
  headers?: HeaderRecord,
): {
  body: null;
  status: typeof status;
  headers: Headers;
} => {
  const responseHeaders = new Headers();

  setHeader(responseHeaders, HeaderName.LOCATION, location);

  if (headers) {
    mergeHeaders(responseHeaders, headers);
  }

  return {
    body: null,
    status,
    headers: responseHeaders,
  };
};

export const toJsonResponse = <TData>(result: OkResult<TData>): Response =>
  new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });

export const toEmptyResponse = (
  result: ReturnType<typeof noContent>,
): Response =>
  new Response(null, {
    status: result.status,
    headers: result.headers,
  });

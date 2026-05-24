import type {
  CursorPaginationMeta,
  CursorPaginatedResponse,
  OffsetPaginationMeta,
  OffsetPaginatedResponse,
  PaginatedResponse,
} from '@aerealith-ai/contracts';

import {
  HeaderName,
  createJsonHeaders,
  mergeHeaders,
  setHeader,
  type HeaderSource,
} from '../headers/headers';
import {
  HttpStatusCode,
  type HttpStatusCode as HttpStatusCodeValue,
} from '../http/status-codes';
import { createRequestId, normalizeRequestId } from '../request/request-id';

/**
 * Paginated response helpers for Helix API services.
 *
 * These helpers are framework-neutral and can be used from Hono handlers,
 * Cloudflare Workers, tests, and service internals.
 */

export type PaginationBaseOptions = {
  status?: HttpStatusCodeValue;
  requestId?: string;
  headers?: HeaderSource;
};

export type CursorPaginatedOptions = PaginationBaseOptions & {
  meta?: Omit<CursorPaginationMeta, 'pagination'>;
};

export type OffsetPaginatedOptions = PaginationBaseOptions & {
  meta?: Omit<OffsetPaginationMeta, 'pagination'>;
};

export type CursorPaginatedBodyWithRequestId<TItem> =
  CursorPaginatedResponse<TItem> & {
    requestId: string;
  };

export type OffsetPaginatedBodyWithRequestId<TItem> =
  OffsetPaginatedResponse<TItem> & {
    requestId: string;
  };

export type PaginatedBodyWithRequestId<TItem> =
  | CursorPaginatedBodyWithRequestId<TItem>
  | OffsetPaginatedBodyWithRequestId<TItem>;

export type PaginatedResult<TItem> = {
  body: PaginatedBodyWithRequestId<TItem>;
  status: HttpStatusCodeValue;
  headers: Headers;
};

export const DEFAULT_CURSOR_PAGINATION_LIMIT = 25;

export const DEFAULT_OFFSET_PAGE = 1;

export const DEFAULT_OFFSET_PAGE_SIZE = 25;

export const MAX_PAGINATION_LIMIT = 100;

export const normalizePaginationLimit = (
  limit: number | null | undefined,
  fallback = DEFAULT_CURSOR_PAGINATION_LIMIT,
): number => {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return fallback;
  }

  return Math.min(
    Math.max(Math.trunc(limit as number), 1),
    MAX_PAGINATION_LIMIT,
  );
};

export const normalizePage = (
  page: number | null | undefined,
  fallback = DEFAULT_OFFSET_PAGE,
): number => {
  if (!Number.isFinite(page ?? Number.NaN)) {
    return fallback;
  }

  return Math.max(Math.trunc(page as number), 1);
};

export const createCursorPaginatedBody = <TItem>(
  items: TItem[],
  pagination: CursorPaginationMeta['pagination'],
  options: Pick<CursorPaginatedOptions, 'requestId' | 'meta'> = {},
): CursorPaginatedBodyWithRequestId<TItem> => {
  const requestId = normalizeRequestId(options.requestId) ?? createRequestId();

  return {
    success: true,
    data: {
      items,
    },
    requestId,
    meta: {
      ...(options.meta ?? {}),
      pagination,
    },
  };
};

export const createOffsetPaginatedBody = <TItem>(
  items: TItem[],
  pagination: OffsetPaginationMeta['pagination'],
  options: Pick<OffsetPaginatedOptions, 'requestId' | 'meta'> = {},
): OffsetPaginatedBodyWithRequestId<TItem> => {
  const requestId = normalizeRequestId(options.requestId) ?? createRequestId();

  return {
    success: true,
    data: {
      items,
    },
    requestId,
    meta: {
      ...(options.meta ?? {}),
      pagination,
    },
  };
};

export const cursorPaginated = <TItem>(
  items: TItem[],
  pagination: CursorPaginationMeta['pagination'],
  options: CursorPaginatedOptions = {},
): PaginatedResult<TItem> => {
  const status = options.status ?? HttpStatusCode.OK;
  const body = createCursorPaginatedBody(items, pagination, options);
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

export const offsetPaginated = <TItem>(
  items: TItem[],
  pagination: OffsetPaginationMeta['pagination'],
  options: OffsetPaginatedOptions = {},
): PaginatedResult<TItem> => {
  const status = options.status ?? HttpStatusCode.OK;
  const body = createOffsetPaginatedBody(items, pagination, options);
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

export const createCursorPaginationMeta = (
  limit: number,
  hasNextPage: boolean,
  options: {
    hasPreviousPage?: boolean;
    nextCursor?: string;
    previousCursor?: string;
    totalCount?: number;
  } = {},
): CursorPaginationMeta['pagination'] => ({
  strategy: 'cursor',
  limit: normalizePaginationLimit(limit),
  hasNextPage,
  ...(options.hasPreviousPage === undefined
    ? {}
    : { hasPreviousPage: options.hasPreviousPage }),
  ...(options.nextCursor ? { nextCursor: options.nextCursor } : {}),
  ...(options.previousCursor ? { previousCursor: options.previousCursor } : {}),
  ...(options.totalCount === undefined
    ? {}
    : { totalCount: options.totalCount }),
});

export const createOffsetPaginationMeta = (
  page: number,
  pageSize: number,
  totalCount: number,
): OffsetPaginationMeta['pagination'] => {
  const normalizedPage = normalizePage(page);
  const normalizedPageSize = normalizePaginationLimit(
    pageSize,
    DEFAULT_OFFSET_PAGE_SIZE,
  );
  const normalizedTotalCount = Math.max(Math.trunc(totalCount), 0);
  const totalPages = Math.max(
    Math.ceil(normalizedTotalCount / normalizedPageSize),
    1,
  );

  return {
    strategy: 'offset',
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages,
    totalCount: normalizedTotalCount,
    hasNextPage: normalizedPage < totalPages,
    hasPreviousPage: normalizedPage > 1,
  };
};

export const toPaginatedResponse = <TItem>(
  result: PaginatedResult<TItem>,
): Response =>
  new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });

export const isCursorPaginatedBody = <TItem = unknown>(
  body: PaginatedResponse<TItem>,
): body is CursorPaginatedResponse<TItem> =>
  body.success === true && body.meta.pagination.strategy === 'cursor';

export const isOffsetPaginatedBody = <TItem = unknown>(
  body: PaginatedResponse<TItem>,
): body is OffsetPaginatedResponse<TItem> =>
  body.success === true && body.meta.pagination.strategy === 'offset';

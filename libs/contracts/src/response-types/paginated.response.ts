import type { ApiResponseMeta, ApiSuccessResponse } from './api.response';

/**
 * Pagination response contracts shared across Helix services.
 *
 * This file stays framework-agnostic:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 * - no frontend imports
 */

export type SortDirection = 'asc' | 'desc';

export type PaginationCursor = string;

export type PaginationRequest = {
  limit?: number;
  cursor?: PaginationCursor;
  sortBy?: string;
  sortDirection?: SortDirection;
};

export type OffsetPaginationRequest = {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: SortDirection;
};

export type CursorPaginationMeta = ApiResponseMeta & {
  pagination: {
    strategy: 'cursor';
    limit: number;
    hasNextPage: boolean;
    hasPreviousPage?: boolean;
    nextCursor?: PaginationCursor;
    previousCursor?: PaginationCursor;
    totalCount?: number;
  };
};

export type OffsetPaginationMeta = ApiResponseMeta & {
  pagination: {
    strategy: 'offset';
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

export type PaginatedResponseMeta = CursorPaginationMeta | OffsetPaginationMeta;

export type PaginatedData<TItem> = {
  items: TItem[];
};

export type CursorPaginatedResponse<TItem> = ApiSuccessResponse<
  PaginatedData<TItem>
> & {
  meta: CursorPaginationMeta;
};

export type OffsetPaginatedResponse<TItem> = ApiSuccessResponse<
  PaginatedData<TItem>
> & {
  meta: OffsetPaginationMeta;
};

export type PaginatedResponse<TItem> =
  | CursorPaginatedResponse<TItem>
  | OffsetPaginatedResponse<TItem>;

export const createCursorPaginatedResponse = <TItem>(
  items: TItem[],
  pagination: CursorPaginationMeta['pagination'],
  meta?: Omit<CursorPaginationMeta, 'pagination'>,
  requestId?: string,
): CursorPaginatedResponse<TItem> => ({
  success: true,
  data: {
    items,
  },
  ...(requestId ? { requestId } : {}),
  meta: {
    ...(meta ?? {}),
    pagination,
  },
});

export const createOffsetPaginatedResponse = <TItem>(
  items: TItem[],
  pagination: OffsetPaginationMeta['pagination'],
  meta?: Omit<OffsetPaginationMeta, 'pagination'>,
  requestId?: string,
): OffsetPaginatedResponse<TItem> => ({
  success: true,
  data: {
    items,
  },
  ...(requestId ? { requestId } : {}),
  meta: {
    ...(meta ?? {}),
    pagination,
  },
});

export const isCursorPaginatedResponse = <TItem = unknown>(
  value: unknown,
): value is CursorPaginatedResponse<TItem> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<CursorPaginatedResponse<TItem>>;

  return (
    candidate.success === true &&
    typeof candidate.data === 'object' &&
    candidate.data !== null &&
    Array.isArray(candidate.data.items) &&
    candidate.meta?.pagination?.strategy === 'cursor'
  );
};

export const isOffsetPaginatedResponse = <TItem = unknown>(
  value: unknown,
): value is OffsetPaginatedResponse<TItem> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<OffsetPaginatedResponse<TItem>>;

  return (
    candidate.success === true &&
    typeof candidate.data === 'object' &&
    candidate.data !== null &&
    Array.isArray(candidate.data.items) &&
    candidate.meta?.pagination?.strategy === 'offset'
  );
};

export const isPaginatedResponse = <TItem = unknown>(
  value: unknown,
): value is PaginatedResponse<TItem> =>
  isCursorPaginatedResponse<TItem>(value) ||
  isOffsetPaginatedResponse<TItem>(value);

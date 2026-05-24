import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getEntityManager } from '@aerealith-ai/db';

import { ListUsersService } from '../services';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_OFFSET = 0;

export const listUsersController = async (
  context: Context,
): Promise<Response> => {
  const query = parseListUsersQuery(context);

  if (!query.ok) {
    return context.json(
      {
        ok: false,
        error: {
          code: 'INVALID_USER_LIST_QUERY',
          message: query.message,
        },
      },
      400,
    );
  }

  const entityManager = (await getEntityManager()) as unknown as EntityManager;
  const service = new ListUsersService({ entityManager });

  const users = await service.execute({
    limit: query.limit,
    offset: query.offset,
    includeDeleted: query.includeDeleted,
  });

  return context.json({
    ok: true,
    data: users,
    meta: {
      limit: query.limit,
      offset: query.offset,
      count: users.length,
    },
  });
};

interface ValidListUsersQuery {
  ok: true;
  limit: number;
  offset: number;
  includeDeleted: boolean;
}

interface InvalidListUsersQuery {
  ok: false;
  message: string;
}

type ListUsersQueryResult = ValidListUsersQuery | InvalidListUsersQuery;

function parseListUsersQuery(context: Context): ListUsersQueryResult {
  const limit = parseOptionalInteger(
    context.req.query('limit'),
    DEFAULT_LIMIT,
    'limit',
  );

  if (!limit.ok) {
    return limit;
  }

  const offset = parseOptionalInteger(
    context.req.query('offset'),
    DEFAULT_OFFSET,
    'offset',
  );

  if (!offset.ok) {
    return offset;
  }

  if (limit.value < 1 || limit.value > MAX_LIMIT) {
    return {
      ok: false,
      message: `limit must be between 1 and ${MAX_LIMIT}.`,
    };
  }

  if (offset.value < 0) {
    return {
      ok: false,
      message: 'offset must be greater than or equal to 0.',
    };
  }

  return {
    ok: true,
    limit: limit.value,
    offset: offset.value,
    includeDeleted: parseOptionalBoolean(context.req.query('includeDeleted')),
  };
}

interface ValidParsedInteger {
  ok: true;
  value: number;
}

interface InvalidParsedInteger {
  ok: false;
  message: string;
}

type ParsedIntegerResult = ValidParsedInteger | InvalidParsedInteger;

function parseOptionalInteger(
  value: string | undefined,
  fallback: number,
  fieldName: string,
): ParsedIntegerResult {
  if (value === undefined || value.trim() === '') {
    return {
      ok: true,
      value: fallback,
    };
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || String(parsed) !== value.trim()) {
    return {
      ok: false,
      message: `${fieldName} must be an integer.`,
    };
  }

  return {
    ok: true,
    value: parsed,
  };
}

function parseOptionalBoolean(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  return ['1', 'true', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
}
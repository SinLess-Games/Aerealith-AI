// apps/services/user/src/users/controllers/delete-user.controller.ts

import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getUsernameParam } from '@aerealith-ai/api';
import { UserErrorCode } from '@aerealith-ai/contracts';
import { getEntityManager } from '@aerealith-ai/db';

import { DeleteUserService, DeleteUserServiceError } from '../services';
import { mapValidationIssues } from './logger';

type ControllerValidationIssue = {
  code: string;
  message: string;
  path: readonly PropertyKey[];
};

export const deleteUserController = async (
  context: Context,
): Promise<Response> => {
  const usernameParam = getUsernameParam(context);

  if (!usernameParam.ok) {
    return context.json(
      {
        ok: false,
        error: {
          code: usernameParam.code,
          message: usernameParam.message,
          issues: mapValidationIssues(
            normalizeValidationIssues(usernameParam.issues),
          ),
        },
      },
      400,
    );
  }

  const entityManager = (await getEntityManager()) as unknown as EntityManager;
  const service = new DeleteUserService({ entityManager });

  try {
    const user = await service.execute(usernameParam.username);

    return context.json({
      ok: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof DeleteUserServiceError) {
      return context.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        getStatusCodeForDeleteUserError(error),
      );
    }

    throw error;
  }
};

function normalizeValidationIssues(
  issues: readonly ControllerValidationIssue[],
): { path: (string | number)[]; code: string; message: string }[] {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.map(normalizeValidationIssuePathSegment),
  }));
}

function normalizeValidationIssuePathSegment(
  segment: PropertyKey,
): string | number {
  if (typeof segment === 'string' || typeof segment === 'number') {
    return segment;
  }

  return segment.description ?? segment.toString();
}

function getStatusCodeForDeleteUserError(
  error: DeleteUserServiceError,
): 404 | 500 {
  switch (error.code) {
    case UserErrorCode.USER_NOT_FOUND:
      return 404;

    case UserErrorCode.USER_DELETE_FAILED:
      return 500;

    default:
      return 500;
  }
}

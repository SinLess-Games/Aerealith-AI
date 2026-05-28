import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { UserErrorCode } from '@aerealith-ai/contracts';
import { getEntityManager } from '@aerealith-ai/db';

import { getUsernameParam } from '@aerealith-ai/api';

import { DeleteUserService, DeleteUserServiceError } from '../services';
import { mapValidationIssues } from './logger';

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
          issues: mapValidationIssues(usernameParam.issues),
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
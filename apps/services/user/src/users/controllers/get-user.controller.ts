import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getUsernameParam } from '@aerealith-ai/api';
import { UserErrorCode } from '@aerealith-ai/contracts';
import { getEntityManager } from '@aerealith-ai/db';

import { GetUserService, GetUserServiceError } from '../services';
import {
  logUserControllerError,
  logUserControllerStart,
  mapValidationIssues,
} from './logger';

export const getUserController = async (
  context: Context,
): Promise<Response> => {
  logUserControllerStart(context, 'Get user request received', {
    tags: ['user', 'read'],
  });

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
  const service = new GetUserService({ entityManager });

  try {
    const user = await service.execute(usernameParam.username);

    return context.json({
      ok: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof GetUserServiceError) {
      logUserControllerError(context, 'Get user request failed', error, {
        tags: ['user', 'read', 'failed'],
      });

      return context.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        getStatusCodeForGetUserError(error),
      );
    }

    throw error;
  }
};

function getStatusCodeForGetUserError(error: GetUserServiceError): 404 {
  switch (error.code) {
    case UserErrorCode.USER_NOT_FOUND:
      return 404;
    default:
      return 404;
  }
}
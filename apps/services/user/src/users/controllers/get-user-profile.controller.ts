import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getUsernameParam } from '@aerealith-ai/api';
import { UserErrorCode } from '@aerealith-ai/contracts';
import { getEntityManager } from '@aerealith-ai/db';

import {
  GetUserProfileService,
  GetUserProfileServiceError,
} from '../services';
import {
  logUserControllerError,
  logUserControllerStart,
  mapValidationIssues,
} from './logger';

export const getUserProfileController = async (
  context: Context,
): Promise<Response> => {
  logUserControllerStart(context, 'Get user profile request received', {
    tags: ['user', 'profile'],
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
  const service = new GetUserProfileService({ entityManager });

  try {
    const profile = await service.execute(usernameParam.username);

    return context.json({
      ok: true,
      data: profile,
    });
  } catch (error) {
    if (error instanceof GetUserProfileServiceError) {
      logUserControllerError(context, 'Get user profile request failed', error, {
        tags: ['user', 'profile', 'failed'],
      });

      return context.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        getStatusCodeForGetUserProfileError(error),
      );
    }

    throw error;
  }
};

function getStatusCodeForGetUserProfileError(
  error: GetUserProfileServiceError,
): 404 {
  switch (error.code) {
    case UserErrorCode.USER_NOT_FOUND:
    case UserErrorCode.USER_PROFILE_NOT_FOUND:
      return 404;
    default:
      return 404;
  }
}

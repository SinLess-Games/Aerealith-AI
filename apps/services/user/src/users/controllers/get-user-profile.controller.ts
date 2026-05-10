import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getUsernameParam } from '@helix-ai/api';
import { UserErrorCode } from '@helix-ai/contracts';
import { getEntityManager } from '@helix-ai/db';

import {
  GetUserProfileService,
  GetUserProfileServiceError,
} from '../services';

export const getUserProfileController = async (
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
          issues: usernameParam.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            code: issue.code,
            message: issue.message,
          })),
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
  }
}
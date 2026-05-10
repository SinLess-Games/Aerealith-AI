import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getUsernameParam } from '@helix-ai/api';
import { UserErrorCode } from '@helix-ai/contracts';
import { getEntityManager } from '@helix-ai/db';

import { GetUserService, GetUserServiceError } from '../services';

export const getUserController = async (
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
  const service = new GetUserService({ entityManager });

  try {
    const user = await service.execute(usernameParam.username);

    return context.json({
      ok: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof GetUserServiceError) {
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
  }
}
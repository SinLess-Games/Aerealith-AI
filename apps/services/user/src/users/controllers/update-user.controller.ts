import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getUsernameParam } from '@aerealith-ai/api';
import {
  UserErrorCode,
  updateUserServiceSchema,
} from '@aerealith-ai/contracts';
import { getEntityManager } from '@aerealith-ai/db';

import { UpdateUserService, UpdateUserServiceError } from '../services';
import { mapValidationIssues } from './logger';

export const updateUserController = async (
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

  const body = await readJsonBody(context);
  const parsedBody = updateUserServiceSchema.safeParse(body);

  if (!parsedBody.success) {
    return context.json(
      {
        ok: false,
        error: {
          code: UserErrorCode.INVALID_PROFILE_PAYLOAD,
          message:
            parsedBody.error.issues[0]?.message ??
            'Invalid update user payload.',
          issues: mapValidationIssues(parsedBody.error.issues),
        },
      },
      400,
    );
  }

  const entityManager = (await getEntityManager()) as unknown as EntityManager;
  const service = new UpdateUserService({ entityManager });

  try {
    const user = await service.execute(usernameParam.username, parsedBody.data);

    return context.json({
      ok: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof UpdateUserServiceError) {
      return context.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        getStatusCodeForUpdateUserError(error),
      );
    }

    throw error;
  }
};

async function readJsonBody(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return {};
  }
}

function getStatusCodeForUpdateUserError(
  error: UpdateUserServiceError,
): 404 | 500 {
  switch (error.code) {
    case UserErrorCode.USER_NOT_FOUND:
      return 404;

    case UserErrorCode.USER_UPDATE_FAILED:
      return 500;

    default:
      return 500;
  }
}
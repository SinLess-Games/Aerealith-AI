import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import {
  UserErrorCode,
  createUserServiceSchema,
} from '@helix-ai/contracts';
import { getEntityManager } from '@helix-ai/db';

import { CreateUserService, CreateUserServiceError } from '../services';

export const createUserController = async (
  context: Context,
): Promise<Response> => {
  const body = await readJsonBody(context);
  const parsedBody = createUserServiceSchema.safeParse(body);

  if (!parsedBody.success) {
    return context.json(
      {
        ok: false,
        error: {
          code: UserErrorCode.INVALID_PROFILE_PAYLOAD,
          message:
            parsedBody.error.issues[0]?.message ??
            'Invalid create user payload.',
          issues: parsedBody.error.issues.map((issue) => ({
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
  const service = new CreateUserService({ entityManager });

  try {
    const user = await service.execute(parsedBody.data);

    return context.json(
      {
        ok: true,
        data: user,
      },
      201,
    );
  } catch (error) {
    if (error instanceof CreateUserServiceError) {
      return context.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        getStatusCodeForCreateUserError(error),
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

function getStatusCodeForCreateUserError(error: CreateUserServiceError): 409 {
  switch (error.code) {
    case UserErrorCode.USER_ALREADY_EXISTS:
      return 409;
  }
}
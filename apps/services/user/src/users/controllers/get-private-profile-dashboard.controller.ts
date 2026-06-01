import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getUsernameParam } from '@aerealith-ai/api';
import { getEntityManager } from '@aerealith-ai/db';

import {
  GetProfileDashboardService,
  GetProfileDashboardServiceError,
} from '../services';

const readHeader = (context: Context, name: string): string | undefined =>
  context.req.header(name)?.trim() || undefined;

function canAccessPrivateProfile(context: Context, username: string): boolean {
  const forwardedUsername =
    readHeader(context, 'x-aerealith-auth-username') ??
    readHeader(context, 'x-helix-username');
  const forwardedUserId = readHeader(context, 'x-aerealith-user-id');

  return (
    forwardedUsername?.toLowerCase() === username.toLowerCase() ||
    Boolean(forwardedUserId)
  );
}

export const getPrivateProfileDashboardController = async (
  context: Context,
): Promise<Response> => {
  const usernameParam = getUsernameParam(context);

  if (!usernameParam.ok) {
    return context.json(
      {
        ok: false,
        error: { code: usernameParam.code, message: usernameParam.message },
      },
      400,
    );
  }

  if (!canAccessPrivateProfile(context, usernameParam.username)) {
    return context.json(
      {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message:
            'Login is required to access this private profile dashboard.',
        },
      },
      401,
    );
  }

  const entityManager = (await getEntityManager()) as unknown as EntityManager;
  const service = new GetProfileDashboardService({ entityManager });

  try {
    return context.json({
      ok: true,
      data: await service.getPrivate(usernameParam.username),
    });
  } catch (error) {
    if (error instanceof GetProfileDashboardServiceError) {
      return context.json(
        { ok: false, error: { code: error.code, message: error.message } },
        404,
      );
    }

    throw error;
  }
};

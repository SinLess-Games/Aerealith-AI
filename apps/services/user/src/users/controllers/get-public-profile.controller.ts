import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getUsernameParam } from '@aerealith-ai/api';
import { getEntityManager } from '@aerealith-ai/db';

import {
  GetProfileDashboardService,
  GetProfileDashboardServiceError,
} from '../services';

export const getPublicProfileController = async (
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

  const entityManager = (await getEntityManager()) as unknown as EntityManager;
  const service = new GetProfileDashboardService({ entityManager });

  try {
    return context.json({
      ok: true,
      data: await service.getPublic(usernameParam.username),
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

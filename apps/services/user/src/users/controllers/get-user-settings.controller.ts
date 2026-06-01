import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';

import { getUsernameParam } from '@aerealith-ai/api';
import { UserErrorCode } from '@aerealith-ai/contracts';
import { getEntityManager } from '@aerealith-ai/db';

import {
  GetUserSettingsService,
  GetUserSettingsServiceError,
} from '../services';
import {
  logUserControllerError,
  logUserControllerStart,
  mapValidationIssues,
} from './logger';

export const getUserSettingsController = async (
  context: Context,
): Promise<Response> => {
  logUserControllerStart(context, 'Get user settings request received', {
    tags: ['user', 'settings'],
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
  const service = new GetUserSettingsService({ entityManager });

  try {
    const settings = await service.execute(usernameParam.username);

    return context.json({
      ok: true,
      data: settings,
    });
  } catch (error) {
    if (error instanceof GetUserSettingsServiceError) {
      logUserControllerError(context, 'Get user settings request failed', error, {
        tags: ['user', 'settings', 'failed'],
      });

      return context.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        getStatusCodeForGetUserSettingsError(error),
      );
    }

    throw error;
  }
};

function getStatusCodeForGetUserSettingsError(
  error: GetUserSettingsServiceError,
): 404 {
  switch (error.code) {
    case UserErrorCode.USER_NOT_FOUND:
    case UserErrorCode.USER_SETTINGS_NOT_FOUND:
      return 404;
    default:
      return 404;
  }
}

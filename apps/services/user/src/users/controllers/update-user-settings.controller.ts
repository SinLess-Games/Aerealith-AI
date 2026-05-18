import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';
import { z } from 'zod';

import { getUsernameParam } from '@helix-ai/api';
import { UserErrorCode } from '@helix-ai/contracts';
import { getEntityManager } from '@helix-ai/db';

import {
  UpdateUserSettingsService,
  UpdateUserSettingsServiceError,
} from '../services';
import type { UpdateUserSettingsInput } from '../services';

const jsonSectionSchema = z.record(z.string(), z.unknown()).optional();

const updateUserSettingsSchema = z.object({
  metadata: jsonSectionSchema,
  accessibility: jsonSectionSchema,
  account: jsonSectionSchema,
  ai: jsonSectionSchema,
  appearance: jsonSectionSchema,
  communication: jsonSectionSchema,
  content: jsonSectionSchema,
  developer: jsonSectionSchema,
  integrations: jsonSectionSchema,
  localization: jsonSectionSchema,
  memory: jsonSectionSchema,
  notifications: jsonSectionSchema,
  privacy: jsonSectionSchema,
  security: jsonSectionSchema,
});

export const updateUserSettingsController = async (
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
        },
      },
      400,
    );
  }

  const body = await context.req.json().catch(() => ({}));
  const parsedBody = updateUserSettingsSchema.safeParse(body);

  if (!parsedBody.success) {
    return context.json(
      {
        ok: false,
        error: {
          code: UserErrorCode.INVALID_SETTINGS_PAYLOAD,
          message:
            parsedBody.error.issues[0]?.message ?? 'Invalid settings payload.',
        },
      },
      400,
    );
  }

  const entityManager = (await getEntityManager()) as unknown as EntityManager;
  const service = new UpdateUserSettingsService({ entityManager });

  try {
    const settings = await service.execute(
      usernameParam.username,
      parsedBody.data as UpdateUserSettingsInput,
    );

    return context.json({ ok: true, data: settings });
  } catch (error) {
    if (error instanceof UpdateUserSettingsServiceError) {
      return context.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.code === UserErrorCode.USER_SETTINGS_UPDATE_FAILED ? 500 : 404,
      );
    }

    throw error;
  } finally {
    await entityManager.getConnection().close();
  }
};

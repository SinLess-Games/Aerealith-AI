import type { EntityManager } from '@mikro-orm/postgresql';
import type { Context } from 'hono';
import { z } from 'zod';

import { getUsernameParam } from '@aerealith-ai/api';
import { UserErrorCode } from '@aerealith-ai/contracts';
import {
  ContentMaturity,
  Country,
  DateFormat,
  Gender,
  LanguageProficiency,
  Languages,
  MeasurementSystem,
  NameDisplayOrder,
  ProfileFieldVisibility,
  ProfileStatus,
  ProfileVisibility,
  Sex,
  Sexuality,
  TimeFormat,
  TimezoneGreenwich,
  TimezoneUtc,
  WeekStartDay,
  getEntityManager,
} from '@aerealith-ai/db';

import {
  UpdateUserProfileService,
  UpdateUserProfileServiceError,
} from '../services';
import type { UpdateUserProfileInput } from '../services';

const nullableText = z.string().trim().max(500).nullable().optional();
const nullableUrl = z.string().trim().url().nullable().optional();
const stringEnum = <T extends Record<string, string | number>>(value: T) =>
  z.enum(
    [...new Set(Object.values(value).filter((item): item is string => typeof item === 'string'))] as [
      string,
      ...string[],
    ],
  );
const nullableEnum = <T extends Record<string, string | number>>(value: T) =>
  stringEnum(value).nullable().optional();

const languagesSchema = z
  .array(
    z.object({
      language: stringEnum(Languages),
      proficiency: stringEnum(LanguageProficiency).optional(),
      isPrimary: z.boolean().optional(),
    }),
  )
  .nullable()
  .optional();

const updateUserProfileSchema = z.object({
  handle: z.string().trim().min(1).max(500).optional(),
  displayName: nullableText,
  givenName: nullableText,
  middleName: nullableText,
  familyName: nullableText,
  pronouns: nullableText,
  avatarUrl: nullableUrl,
  bannerUrl: nullableUrl,
  bio: z.string().trim().max(1000).nullable().optional(),
  status: nullableEnum(ProfileStatus),
  visibility: nullableEnum(ProfileVisibility),
  fieldVisibility: z
    .record(z.string().trim().min(1), stringEnum(ProfileFieldVisibility))
    .nullable()
    .optional(),
  locationLabel: nullableText,
  country: nullableEnum(Country),
  gender: nullableEnum(Gender),
  sex: nullableEnum(Sex),
  sexuality: nullableEnum(Sexuality),
  primaryLanguage: nullableEnum(Languages),
  languages: languagesSchema,
  locale: nullableText,
  timezone: nullableText,
  timezoneUtc: nullableEnum(TimezoneUtc),
  timezoneGreenwich: nullableEnum(TimezoneGreenwich),
  weekStartDay: nullableEnum(WeekStartDay),
  dateFormat: nullableEnum(DateFormat),
  timeFormat: nullableEnum(TimeFormat),
  nameDisplayOrder: nullableEnum(NameDisplayOrder),
  measurementSystem: nullableEnum(MeasurementSystem),
  contentMaturity: nullableEnum(ContentMaturity),
  websiteUrl: nullableUrl,
  links: z.record(z.string().trim().min(1), z.string().trim().url()).nullable().optional(),
});

const readHeader = (context: Context, name: string): string | undefined =>
  context.req.header(name)?.trim() || undefined;

function canUpdateProfile(context: Context, username: string): boolean {
  const forwardedUsername =
    readHeader(context, 'x-aerealith-auth-username') ??
    readHeader(context, 'x-helix-username');
  const forwardedUserId = readHeader(context, 'x-aerealith-user-id');

  return (
    forwardedUsername?.toLowerCase() === username.toLowerCase() ||
    Boolean(forwardedUserId)
  );
}

export const updateUserProfileController = async (
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

  if (!canUpdateProfile(context, usernameParam.username)) {
    return context.json(
      {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Login is required to update this profile.',
        },
      },
      401,
    );
  }

  const body = await context.req.json().catch(() => ({}));
  const parsedBody = updateUserProfileSchema.safeParse(body);

  if (!parsedBody.success) {
    return context.json(
      {
        ok: false,
        error: {
          code: UserErrorCode.INVALID_PROFILE_PAYLOAD,
          message:
            parsedBody.error.issues[0]?.message ?? 'Invalid profile payload.',
        },
      },
      400,
    );
  }

  const entityManager = (await getEntityManager()) as unknown as EntityManager;
  const service = new UpdateUserProfileService({ entityManager });

  try {
    const profile = await service.execute(
      usernameParam.username,
      parsedBody.data as UpdateUserProfileInput,
    );

    return context.json({ ok: true, data: profile });
  } catch (error) {
    if (error instanceof UpdateUserProfileServiceError) {
      return context.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.code === UserErrorCode.USER_UPDATE_FAILED ? 500 : 404,
      );
    }

    throw error;
  }
};

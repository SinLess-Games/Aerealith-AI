import type {
  UserServiceSettingsDto,
  UserServiceUserId,
  UserServiceUsername,
} from '@helix-ai/contracts';

type DateLike = Date | string | null | undefined;

export type UserSettingsTheme = 'system' | 'light' | 'dark';

export interface UserSettingsMapperInput {
  id?: string;
  userId?: string;
  username?: string | null;

  locale?: string | null;
  timezone?: string | null;
  theme?: UserSettingsTheme | string | null;

  emailNotificationsEnabled?: boolean | null;
  marketingEmailsEnabled?: boolean | null;
  analyticsEnabled?: boolean | null;
  memoryEnabled?: boolean | null;

  createdAt?: DateLike;
  updatedAt?: DateLike;

  user?: {
    id?: string;
    username?: string | null;
  } | null;
}

export interface UserSettingsMapperOptions {
  userId?: string;
  username?: string;
  defaultLocale?: string;
  defaultTimezone?: string;
  defaultTheme?: UserSettingsTheme;
}

export const toUserSettingsDto = (
  settings: UserSettingsMapperInput,
  options: UserSettingsMapperOptions = {},
): UserServiceSettingsDto => {
  const userId = resolveUserId(settings, options);
  const username = resolveUsername(settings, options);

  return {
    userId: userId as UserServiceUserId,
    username: username as UserServiceUsername,
    locale: settings.locale ?? options.defaultLocale ?? 'en-US',
    timezone: settings.timezone ?? options.defaultTimezone ?? 'UTC',
    theme: normalizeTheme(settings.theme, options.defaultTheme),
    emailNotificationsEnabled: settings.emailNotificationsEnabled ?? true,
    marketingEmailsEnabled: settings.marketingEmailsEnabled ?? false,
    analyticsEnabled: settings.analyticsEnabled ?? true,
    memoryEnabled: settings.memoryEnabled ?? true,
    createdAt: toIsoString(settings.createdAt),
    updatedAt: toIsoString(settings.updatedAt),
  };
};

export const toUserSettingsDtos = (
  settingsList: UserSettingsMapperInput[],
  options: UserSettingsMapperOptions = {},
): UserServiceSettingsDto[] =>
  settingsList.map((settings) => toUserSettingsDto(settings, options));

function resolveUserId(
  settings: UserSettingsMapperInput,
  options: UserSettingsMapperOptions,
): string {
  const userId = options.userId ?? settings.userId ?? settings.user?.id;

  if (!userId) {
    throw new Error('USER_SETTINGS_MAPPER_MISSING_USER_ID');
  }

  return userId;
}

function resolveUsername(
  settings: UserSettingsMapperInput,
  options: UserSettingsMapperOptions,
): string {
  const username = options.username ?? settings.username ?? settings.user?.username;

  if (!username) {
    throw new Error('USER_SETTINGS_MAPPER_MISSING_USERNAME');
  }

  return username;
}

function normalizeTheme(
  theme: UserSettingsMapperInput['theme'],
  fallback: UserSettingsTheme = 'system',
): UserSettingsTheme {
  if (theme === 'light' || theme === 'dark' || theme === 'system') {
    return theme;
  }

  return fallback;
}

function toIsoString(value: DateLike): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return new Date().toISOString();
}
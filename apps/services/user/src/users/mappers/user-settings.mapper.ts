import type {
  UserServiceSettingsDto,
  UserServiceUserId,
  UserServiceUsername,
} from '@helix-ai/contracts';

type DateLike = Date | string | null | undefined;

export interface UserSettingsMapperInput {
  id?: string;
  userId?: string;
  username?: string | null;
  metadata?: Record<string, unknown> | null;
  accessibility?: Record<string, unknown> | null;
  account?: Record<string, unknown> | null;
  ai?: Record<string, unknown> | null;
  appearance?: Record<string, unknown> | null;
  communication?: Record<string, unknown> | null;
  content?: Record<string, unknown> | null;
  developer?: Record<string, unknown> | null;
  integrations?: Record<string, unknown> | null;
  localization?: Record<string, unknown> | null;
  memory?: Record<string, unknown> | null;
  notifications?: Record<string, unknown> | null;
  privacy?: Record<string, unknown> | null;
  security?: Record<string, unknown> | null;

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
}

export const toUserSettingsDto = (
  settings: UserSettingsMapperInput,
  options: UserSettingsMapperOptions = {},
): UserServiceSettingsDto => {
  const userId = resolveUserId(settings, options);
  const username = resolveUsername(settings, options);

  return {
    id: resolveSettingsId(settings),
    userId: userId as UserServiceUserId,
    username: username as UserServiceUsername,
    metadata: settings.metadata ?? {},
    accessibility: settings.accessibility ?? {},
    account: settings.account ?? {},
    ai: settings.ai ?? {},
    appearance: settings.appearance ?? {},
    communication: settings.communication ?? {},
    content: settings.content ?? {},
    developer: settings.developer ?? {},
    integrations: settings.integrations ?? {},
    localization: settings.localization ?? {},
    memory: settings.memory ?? {},
    notifications: settings.notifications ?? {},
    privacy: settings.privacy ?? {},
    security: settings.security ?? {},
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

function resolveSettingsId(settings: UserSettingsMapperInput): string {
  if (!settings.id) {
    throw new Error('USER_SETTINGS_MAPPER_MISSING_SETTINGS_ID');
  }

  return settings.id;
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

function toIsoString(value: DateLike): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return new Date().toISOString();
}

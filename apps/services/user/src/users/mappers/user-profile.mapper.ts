import type {
  UserServiceProfileDto,
  UserServiceUserId,
  UserServiceUsername,
} from '@helix-ai/contracts';

type DateLike = Date | string | null | undefined;

export interface UserProfileMapperInput {
  id?: string;
  userId?: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  createdAt?: DateLike;
  updatedAt?: DateLike;

  user?: {
    id?: string;
    username?: string | null;
    displayName?: string | null;
  } | null;
}

export interface UserProfileMapperOptions {
  userId?: string;
  username?: string;
  displayName?: string;
}

export const toUserProfileDto = (
  profile: UserProfileMapperInput,
  options: UserProfileMapperOptions = {},
): UserServiceProfileDto => {
  const userId = resolveUserId(profile, options);
  const username = resolveUsername(profile, options);
  const displayName = resolveDisplayName(profile, options, username);

  return {
    userId: userId as UserServiceUserId,
    username: username as UserServiceUsername,
    displayName,
    avatarUrl: profile.avatarUrl ?? null,
    bio: profile.bio ?? null,
    location: profile.location ?? null,
    websiteUrl: profile.websiteUrl ?? null,
    createdAt: toIsoString(profile.createdAt),
    updatedAt: toIsoString(profile.updatedAt),
  };
};

export const toUserProfileDtos = (
  profiles: UserProfileMapperInput[],
  options: UserProfileMapperOptions = {},
): UserServiceProfileDto[] =>
  profiles.map((profile) => toUserProfileDto(profile, options));

function resolveUserId(
  profile: UserProfileMapperInput,
  options: UserProfileMapperOptions,
): string {
  const userId = options.userId ?? profile.userId ?? profile.user?.id;

  if (!userId) {
    throw new Error('USER_PROFILE_MAPPER_MISSING_USER_ID');
  }

  return userId;
}

function resolveUsername(
  profile: UserProfileMapperInput,
  options: UserProfileMapperOptions,
): string {
  const username = options.username ?? profile.username ?? profile.user?.username;

  if (!username) {
    throw new Error('USER_PROFILE_MAPPER_MISSING_USERNAME');
  }

  return username;
}

function resolveDisplayName(
  profile: UserProfileMapperInput,
  options: UserProfileMapperOptions,
  username: string,
): string {
  return (
    options.displayName ??
    profile.displayName ??
    profile.user?.displayName ??
    username
  );
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
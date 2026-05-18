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
  handle?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  pronouns?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  status?: string | null;
  visibility?: string | null;
  fieldVisibility?: Record<string, string> | null;
  locationLabel?: string | null;
  country?: string | null;
  gender?: string | null;
  sex?: string | number | null;
  sexuality?: string | null;
  primaryLanguage?: string | null;
  languages?: Array<{
    language: string;
    proficiency?: string;
    isPrimary?: boolean;
  }> | null;
  locale?: string | null;
  timezone?: string | null;
  timezoneUtc?: string | null;
  timezoneGreenwich?: string | null;
  weekStartDay?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
  nameDisplayOrder?: string | null;
  measurementSystem?: string | null;
  contentMaturity?: string | null;
  websiteUrl?: string | null;
  links?: Record<string, string | undefined> | null;
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
    id: resolveProfileId(profile),
    userId: userId as UserServiceUserId,
    username: username as UserServiceUsername,
    handle: profile.handle ?? username,
    displayName,
    givenName: profile.givenName ?? null,
    middleName: profile.middleName ?? null,
    familyName: profile.familyName ?? null,
    pronouns: profile.pronouns ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    bannerUrl: profile.bannerUrl ?? null,
    bio: profile.bio ?? null,
    status: profile.status ?? null,
    visibility: profile.visibility ?? null,
    fieldVisibility: profile.fieldVisibility ?? null,
    locationLabel: profile.locationLabel ?? null,
    country: profile.country ?? null,
    gender: profile.gender ?? null,
    sex: normalizeSex(profile.sex),
    sexuality: profile.sexuality ?? null,
    primaryLanguage: profile.primaryLanguage ?? null,
    languages: profile.languages ?? null,
    locale: profile.locale ?? null,
    timezone: profile.timezone ?? null,
    timezoneUtc: profile.timezoneUtc ?? null,
    timezoneGreenwich: profile.timezoneGreenwich ?? null,
    weekStartDay: profile.weekStartDay ?? null,
    dateFormat: profile.dateFormat ?? null,
    timeFormat: profile.timeFormat ?? null,
    nameDisplayOrder: profile.nameDisplayOrder ?? null,
    measurementSystem: profile.measurementSystem ?? null,
    contentMaturity: profile.contentMaturity ?? null,
    websiteUrl: profile.websiteUrl ?? null,
    links: profile.links ?? null,
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

function resolveProfileId(profile: UserProfileMapperInput): string {
  if (!profile.id) {
    throw new Error('USER_PROFILE_MAPPER_MISSING_PROFILE_ID');
  }

  return profile.id;
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

function normalizeSex(value: string | number | null | undefined): string | null {
  if (typeof value === 'number') {
    return ['male', 'female', 'hermaphrodite'][value] ?? null;
  }

  return value ?? null;
}

import type {
  PrivateUserProfileDashboardDto,
  PublicUserProfileDto,
  UserAchievementDto,
  UserActivityEventDto,
  UserAppConnectionDto,
  UserFileReferenceDto,
  UserIntegrationDto,
  UserProfileStatsDto,
  UserReportDto,
  UserServiceProfileDto,
} from '@aerealith-ai/contracts';

type DateLike = Date | string | null | undefined;

type AchievementLike = {
  id?: string;
  key?: string;
  title?: string;
  description?: string;
  iconKey?: string;
  points?: number;
  category?: string;
  progressCurrent?: number;
  progressTarget?: number;
  unlocked?: boolean;
  unlockedAt?: DateLike;
  visibility?: string;
};

type AppConnectionLike = {
  id?: string;
  provider?: string;
  displayName?: string;
  connectedAccountIdentifier?: string | null;
  status?: string;
  connectedAt?: DateLike;
  lastSyncAt?: DateLike;
  scopesSummary?: string[] | null;
};

type IntegrationLike = {
  id?: string;
  integrationKey?: string;
  provider?: string;
  displayName?: string;
  description?: string | null;
  enabled?: boolean;
  status?: string;
  healthMetadata?: Record<string, unknown> | null;
};

type FileLike = {
  id?: string;
  name?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  visibility?: string;
  lastModifiedAt?: DateLike;
};

type ReportLike = {
  id?: string;
  title?: string;
  type?: string;
  status?: string;
  visibility?: string;
  generatedAt?: DateLike;
  metadata?: Record<string, unknown> | null;
};

type ActivityLike = {
  id?: string;
  type?: string;
  title?: string;
  description?: string | null;
  createdAt?: DateLike;
};

export interface ProfileDashboardMapperInput {
  profile: UserServiceProfileDto;
  achievements: AchievementLike[];
  appConnections: AppConnectionLike[];
  integrations: IntegrationLike[];
  files: FileLike[];
  reports: ReportLike[];
  activity: ActivityLike[];
}

export function toPrivateProfileDashboardDto(
  input: ProfileDashboardMapperInput,
): PrivateUserProfileDashboardDto {
  const achievements = input.achievements.map(toAchievementDto);
  const files = input.files.map(toFileDto);
  const reports = input.reports.map(toReportDto);

  return {
    profile: input.profile,
    stats: toStats({
      achievements,
      appConnections: input.appConnections.length,
      integrations: input.integrations.length,
      files: files.length,
      reports: reports.length,
    }),
    achievements,
    appConnections: input.appConnections.map(toAppConnectionDto),
    integrations: input.integrations.map(toIntegrationDto),
    files,
    reports,
    activity: input.activity.map(toActivityDto),
  };
}

export function toPublicProfileDto(
  input: Omit<
    ProfileDashboardMapperInput,
    'appConnections' | 'integrations' | 'activity'
  >,
): PublicUserProfileDto {
  const achievements = input.achievements.map(toAchievementDto);
  const files = input.files.map(toFileDto);
  const reports = input.reports.map(toReportDto);
  const { profile } = input;

  return {
    profile: {
      id: profile.id,
      userId: profile.userId,
      username: profile.username,
      handle: profile.handle,
      displayName: profile.displayName,
      pronouns: profile.pronouns,
      avatarUrl: profile.avatarUrl,
      bannerUrl: profile.bannerUrl,
      bio: profile.bio,
      visibility: profile.visibility,
      locationLabel: profile.locationLabel,
      country: profile.country,
      primaryLanguage: profile.primaryLanguage,
      languages: profile.languages,
      websiteUrl: profile.websiteUrl,
      links: profile.links,
      createdAt: profile.createdAt,
    },
    stats: toStats({
      achievements,
      appConnections: 0,
      integrations: 0,
      files: files.length,
      reports: reports.length,
    }),
    achievements,
    files,
    reports,
  };
}

function toStats(input: {
  achievements: UserAchievementDto[];
  appConnections: number;
  integrations: number;
  files: number;
  reports: number;
}): UserProfileStatsDto {
  return {
    achievements: input.achievements.length,
    appConnections: input.appConnections,
    files: input.files,
    integrations: input.integrations,
    reports: input.reports,
    totalPoints: input.achievements.reduce(
      (total, item) => total + item.points,
      0,
    ),
  };
}

function toAchievementDto(item: AchievementLike): UserAchievementDto {
  const current = item.progressCurrent ?? 0;
  const target = Math.max(item.progressTarget ?? 1, 1);

  return {
    id: requireId(item.id),
    key: item.key ?? 'achievement',
    title: item.title ?? 'Achievement',
    description: item.description ?? '',
    iconKey: item.iconKey ?? 'sparkle',
    points: item.points ?? 0,
    category: item.category ?? 'general',
    progress: {
      current,
      target,
      percentage: Math.min(100, Math.round((current / target) * 100)),
    },
    unlocked: item.unlocked ?? false,
    unlockedAt: toIsoOrNull(item.unlockedAt),
    visibility: normalizeVisibility(item.visibility),
  };
}

function toAppConnectionDto(item: AppConnectionLike): UserAppConnectionDto {
  return {
    id: requireId(item.id),
    provider: item.provider ?? 'unknown',
    displayName: item.displayName ?? item.provider ?? 'Connected app',
    connectedAccountIdentifier: item.connectedAccountIdentifier ?? null,
    status: normalizeStatus(item.status),
    connectedAt: toIsoOrNull(item.connectedAt),
    lastSyncAt: toIsoOrNull(item.lastSyncAt),
    scopesSummary: item.scopesSummary ?? [],
  };
}

function toIntegrationDto(item: IntegrationLike): UserIntegrationDto {
  return {
    id: requireId(item.id),
    integrationKey: item.integrationKey ?? item.provider ?? 'integration',
    provider: item.provider ?? 'unknown',
    displayName: item.displayName ?? item.provider ?? 'Integration',
    description: item.description ?? null,
    enabled: item.enabled ?? false,
    status: normalizeStatus(item.status),
    healthMetadata: item.healthMetadata ?? {},
  };
}

function toFileDto(item: FileLike): UserFileReferenceDto {
  return {
    id: requireId(item.id),
    name: item.name ?? 'File',
    mimeType: item.mimeType ?? null,
    sizeBytes: item.sizeBytes ?? null,
    visibility: normalizeVisibility(item.visibility),
    lastModifiedAt: toIsoOrNull(item.lastModifiedAt),
  };
}

function toReportDto(item: ReportLike): UserReportDto {
  return {
    id: requireId(item.id),
    title: item.title ?? 'Report',
    type: normalizeReportType(item.type),
    status: normalizeStatus(item.status),
    visibility: normalizeVisibility(item.visibility),
    generatedAt: toIsoOrNull(item.generatedAt),
    metadata: item.metadata ?? {},
  };
}

function toActivityDto(item: ActivityLike): UserActivityEventDto {
  return {
    id: requireId(item.id),
    type: item.type ?? 'activity',
    title: item.title ?? 'Activity',
    description: item.description ?? null,
    createdAt: toIso(item.createdAt),
  };
}

function requireId(value: string | undefined): string {
  if (!value) {
    throw new Error('PROFILE_DASHBOARD_MAPPER_MISSING_ID');
  }

  return value;
}

function toIso(value: DateLike): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === 'string' ? value : new Date().toISOString();
}

function toIsoOrNull(value: DateLike): string | null {
  return value ? toIso(value) : null;
}

function normalizeStatus(
  value: string | undefined,
): UserAppConnectionDto['status'] {
  const allowed = [
    'active',
    'connected',
    'enabled',
    'disabled',
    'pending',
    'failed',
    'archived',
    'revoked',
  ];

  return allowed.includes(value ?? '')
    ? (value as UserAppConnectionDto['status'])
    : 'active';
}

function normalizeVisibility(
  value: string | undefined,
): UserAchievementDto['visibility'] {
  return value === 'public' || value === 'unlisted' ? value : 'private';
}

function normalizeReportType(value: string | undefined): UserReportDto['type'] {
  const allowed = [
    'account_export',
    'data_quality',
    'model_evaluation',
    'performance',
    'usage',
  ];

  return allowed.includes(value ?? '')
    ? (value as UserReportDto['type'])
    : 'usage';
}

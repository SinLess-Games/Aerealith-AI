import type { UserProfileDto } from './user-profile.dto';

export type ProfileModuleStatusDto =
  | 'active'
  | 'connected'
  | 'enabled'
  | 'disabled'
  | 'pending'
  | 'failed'
  | 'archived'
  | 'revoked';

export type ProfileResourceVisibilityDto = 'private' | 'public' | 'unlisted';

export interface UserAchievementDto {
  id: string;
  key: string;
  title: string;
  description: string;
  iconKey: string;
  points: number;
  category: string;
  progress: {
    current: number;
    target: number;
    percentage: number;
  };
  unlocked: boolean;
  unlockedAt: string | null;
  visibility: ProfileResourceVisibilityDto;
}

export interface UserAppConnectionDto {
  id: string;
  provider: string;
  displayName: string;
  connectedAccountIdentifier: string | null;
  status: ProfileModuleStatusDto;
  connectedAt: string | null;
  lastSyncAt: string | null;
  scopesSummary: string[];
}

export interface UserIntegrationDto {
  id: string;
  integrationKey: string;
  provider: string;
  displayName: string;
  description: string | null;
  enabled: boolean;
  status: ProfileModuleStatusDto;
  healthMetadata: Record<string, unknown>;
}

export interface UserFileReferenceDto {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  visibility: ProfileResourceVisibilityDto;
  lastModifiedAt: string | null;
}

export type UserReportTypeDto =
  | 'account_export'
  | 'data_quality'
  | 'model_evaluation'
  | 'performance'
  | 'usage';

export interface UserReportDto {
  id: string;
  title: string;
  type: UserReportTypeDto;
  status: ProfileModuleStatusDto;
  visibility: ProfileResourceVisibilityDto;
  generatedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface UserActivityEventDto {
  id: string;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
}

export interface UserProfileStatsDto {
  achievements: number;
  appConnections: number;
  files: number;
  integrations: number;
  reports: number;
  totalPoints: number;
}

export interface PublicUserProfileDto {
  profile: Pick<
    UserProfileDto,
    | 'id'
    | 'userId'
    | 'username'
    | 'handle'
    | 'displayName'
    | 'pronouns'
    | 'avatarUrl'
    | 'bannerUrl'
    | 'bio'
    | 'visibility'
    | 'locationLabel'
    | 'country'
    | 'primaryLanguage'
    | 'languages'
    | 'websiteUrl'
    | 'links'
    | 'createdAt'
  >;
  stats: UserProfileStatsDto;
  achievements: UserAchievementDto[];
  files: UserFileReferenceDto[];
  reports: UserReportDto[];
}

export interface PrivateUserProfileDashboardDto {
  profile: UserProfileDto;
  stats: UserProfileStatsDto;
  achievements: UserAchievementDto[];
  appConnections: UserAppConnectionDto[];
  integrations: UserIntegrationDto[];
  files: UserFileReferenceDto[];
  reports: UserReportDto[];
  activity: UserActivityEventDto[];
}

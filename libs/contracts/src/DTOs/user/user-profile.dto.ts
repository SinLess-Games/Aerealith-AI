import type { UserId, Username } from '../../types/user';

export interface UserProfileDto {
  id: string;
  userId: UserId;
  username: Username;
  handle: string;
  displayName: string;
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
  sex?: string | null;
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
  createdAt: string;
  updatedAt: string;
}

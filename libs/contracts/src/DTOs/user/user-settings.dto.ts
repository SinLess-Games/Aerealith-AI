import type { UserId, Username } from '../../types/user';

export interface UserSettingsDto {
  userId: UserId;
  username: Username;
  locale: string;
  timezone: string;
  theme: 'system' | 'light' | 'dark';
  emailNotificationsEnabled: boolean;
  marketingEmailsEnabled: boolean;
  analyticsEnabled: boolean;
  memoryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
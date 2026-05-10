import type { UserId, Username } from '../../types/user';

export interface UserProfileDto {
  userId: UserId;
  username: Username;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}
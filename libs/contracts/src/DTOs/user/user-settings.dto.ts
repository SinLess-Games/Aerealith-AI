import type { UserId, Username } from '../../types/user';

export interface UserSettingsDto {
  id: string;
  userId: UserId;
  username: Username;
  metadata: Record<string, unknown>;
  accessibility: Record<string, unknown>;
  account: Record<string, unknown>;
  ai: Record<string, unknown>;
  appearance: Record<string, unknown>;
  communication: Record<string, unknown>;
  content: Record<string, unknown>;
  developer: Record<string, unknown>;
  integrations: Record<string, unknown>;
  localization: Record<string, unknown>;
  memory: Record<string, unknown>;
  notifications: Record<string, unknown>;
  privacy: Record<string, unknown>;
  security: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

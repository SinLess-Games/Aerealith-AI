// libs/db/src/types/user-settings/user-settings.type.ts

import type {
  AccessibilityUserSettings,
  AccessibilityUserSettingsPatch,
} from './accessibility.type.js';
import type {
  AccountUserSettings,
  AccountUserSettingsPatch,
} from './account.type.js';
import type { AiUserSettings, AiUserSettingsPatch } from './ai.type.js';
import type {
  AppearanceUserSettings,
  AppearanceUserSettingsPatch,
} from './appearance.type.js';
import type {
  CommunicationUserSettings,
  CommunicationUserSettingsPatch,
} from './communication.type.js';
import type {
  ContentUserSettings,
  ContentUserSettingsPatch,
} from './content.type.js';
import type {
  DeveloperUserSettings,
  DeveloperUserSettingsPatch,
} from './developer.type.js';
import type {
  IntegrationUserSettings,
  IntegrationUserSettingsPatch,
} from './integrations.type.js';
import type {
  LocalizationUserSettings,
  LocalizationUserSettingsPatch,
} from './localization.type.js';
import type {
  MemoryUserSettings,
  MemoryUserSettingsPatch,
} from './memory.type.js';
import type {
  NotificationUserSettings,
  NotificationUserSettingsPatch,
} from './notifications.type.js';
import type {
  PrivacyUserSettings,
  PrivacyUserSettingsPatch,
} from './privacy.type.js';
import type {
  SecurityUserSettings,
  SecurityUserSettingsPatch,
} from './security.type.js';

export type UserSettingsSectionKey =
  | 'accessibility'
  | 'account'
  | 'ai'
  | 'appearance'
  | 'communication'
  | 'content'
  | 'developer'
  | 'integrations'
  | 'localization'
  | 'memory'
  | 'notifications'
  | 'privacy'
  | 'security';

export type UserSettingsSource =
  | 'system_default'
  | 'user'
  | 'organization'
  | 'workspace'
  | 'project'
  | 'admin'
  | 'migration'
  | 'import'
  | 'automation'
  | 'custom';

export type UserSettingsSyncStatus =
  | 'local_only'
  | 'synced'
  | 'pending_sync'
  | 'sync_failed'
  | 'conflict'
  | 'disabled';

export type UserSettingsMetadata = {
  schemaVersion?: number;
  source?: UserSettingsSource;
  syncStatus?: UserSettingsSyncStatus;
  createdAt?: string;
  updatedAt?: string;
  lastSyncedAt?: string;
  lastReviewedAt?: string;
  importedAt?: string;
  exportedAt?: string;
};

export type UserSettings = {
  metadata?: UserSettingsMetadata;
  accessibility?: AccessibilityUserSettings;
  account?: AccountUserSettings;
  ai?: AiUserSettings;
  appearance?: AppearanceUserSettings;
  communication?: CommunicationUserSettings;
  content?: ContentUserSettings;
  developer?: DeveloperUserSettings;
  integrations?: IntegrationUserSettings;
  localization?: LocalizationUserSettings;
  memory?: MemoryUserSettings;
  notifications?: NotificationUserSettings;
  privacy?: PrivacyUserSettings;
  security?: SecurityUserSettings;
};

export type UserSettingsPatch = {
  metadata?: Partial<UserSettingsMetadata>;
  accessibility?: AccessibilityUserSettingsPatch;
  account?: AccountUserSettingsPatch;
  ai?: AiUserSettingsPatch;
  appearance?: AppearanceUserSettingsPatch;
  communication?: CommunicationUserSettingsPatch;
  content?: ContentUserSettingsPatch;
  developer?: DeveloperUserSettingsPatch;
  integrations?: IntegrationUserSettingsPatch;
  localization?: LocalizationUserSettingsPatch;
  memory?: MemoryUserSettingsPatch;
  notifications?: NotificationUserSettingsPatch;
  privacy?: PrivacyUserSettingsPatch;
  security?: SecurityUserSettingsPatch;
};

export type UserSettingsSectionMap = {
  accessibility: AccessibilityUserSettings;
  account: AccountUserSettings;
  ai: AiUserSettings;
  appearance: AppearanceUserSettings;
  communication: CommunicationUserSettings;
  content: ContentUserSettings;
  developer: DeveloperUserSettings;
  integrations: IntegrationUserSettings;
  localization: LocalizationUserSettings;
  memory: MemoryUserSettings;
  notifications: NotificationUserSettings;
  privacy: PrivacyUserSettings;
  security: SecurityUserSettings;
};

export type UserSettingsPatchSectionMap = {
  accessibility: AccessibilityUserSettingsPatch;
  account: AccountUserSettingsPatch;
  ai: AiUserSettingsPatch;
  appearance: AppearanceUserSettingsPatch;
  communication: CommunicationUserSettingsPatch;
  content: ContentUserSettingsPatch;
  developer: DeveloperUserSettingsPatch;
  integrations: IntegrationUserSettingsPatch;
  localization: LocalizationUserSettingsPatch;
  memory: MemoryUserSettingsPatch;
  notifications: NotificationUserSettingsPatch;
  privacy: PrivacyUserSettingsPatch;
  security: SecurityUserSettingsPatch;
};

export type UserSettingsSection<
  TSection extends UserSettingsSectionKey,
> = UserSettingsSectionMap[TSection];

export type UserSettingsPatchSection<
  TSection extends UserSettingsSectionKey,
> = UserSettingsPatchSectionMap[TSection];
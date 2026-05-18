// libs/db/src/types/user-settings/integrations.type.ts

export type IntegrationPreferenceMode = 'system' | 'enabled' | 'disabled';

export type IntegrationProviderCategory =
  | 'identity'
  | 'email'
  | 'calendar'
  | 'contacts'
  | 'files'
  | 'documents'
  | 'spreadsheets'
  | 'slides'
  | 'messaging'
  | 'social'
  | 'streaming'
  | 'developer'
  | 'source_control'
  | 'ci_cd'
  | 'cloud'
  | 'database'
  | 'storage'
  | 'analytics'
  | 'observability'
  | 'payments'
  | 'automation'
  | 'ai'
  | 'iot'
  | 'custom';

export type IntegrationProvider =
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'google'
  | 'google_drive'
  | 'google_docs'
  | 'google_sheets'
  | 'google_slides'
  | 'gmail'
  | 'google_calendar'
  | 'google_contacts'
  | 'microsoft'
  | 'outlook'
  | 'onedrive'
  | 'sharepoint'
  | 'teams'
  | 'discord'
  | 'slack'
  | 'matrix'
  | 'telegram'
  | 'twitch'
  | 'youtube'
  | 'x'
  | 'mastodon'
  | 'bluesky'
  | 'dropbox'
  | 'box'
  | 'notion'
  | 'obsidian'
  | 'linear'
  | 'jira'
  | 'trello'
  | 'asana'
  | 'clickup'
  | 'stripe'
  | 'paypal'
  | 'cloudflare'
  | 'aws'
  | 'azure'
  | 'gcp'
  | 'vercel'
  | 'netlify'
  | 'docker_hub'
  | 'npm'
  | 'grafana'
  | 'prometheus'
  | 'loki'
  | 'tempo'
  | 'sentry'
  | 'posthog'
  | 'plausible'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'home_assistant'
  | 'webhook'
  | 'custom';

export type IntegrationAuthType =
  | 'none'
  | 'oauth2'
  | 'oauth1'
  | 'api_key'
  | 'pat'
  | 'basic'
  | 'bearer_token'
  | 'jwt'
  | 'service_account'
  | 'ssh_key'
  | 'webhook_secret'
  | 'custom';

export type IntegrationConnectionStatus =
  | 'not_connected'
  | 'pending'
  | 'connected'
  | 'reauth_required'
  | 'expired'
  | 'revoked'
  | 'error'
  | 'disabled'
  | 'archived';

export type IntegrationPermissionLevel =
  | 'none'
  | 'read'
  | 'write'
  | 'read_write'
  | 'admin'
  | 'owner'
  | 'custom';

export type IntegrationDataAccessLevel =
  | 'none'
  | 'metadata_only'
  | 'read_public'
  | 'read_private'
  | 'read_write'
  | 'full_access'
  | 'custom';

export type IntegrationScopeSensitivity =
  | 'non_sensitive'
  | 'sensitive'
  | 'restricted'
  | 'unknown';

export type IntegrationSyncDirection =
  | 'disabled'
  | 'pull'
  | 'push'
  | 'bidirectional';

export type IntegrationSyncFrequency =
  | 'manual'
  | 'realtime'
  | 'every_5_minutes'
  | 'every_15_minutes'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom';

export type IntegrationConflictStrategy =
  | 'manual_review'
  | 'prefer_local'
  | 'prefer_remote'
  | 'newest_wins'
  | 'oldest_wins'
  | 'merge'
  | 'duplicate'
  | 'custom';

export type IntegrationWebhookEvent =
  | 'connected'
  | 'disconnected'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'item_created'
  | 'item_updated'
  | 'item_deleted'
  | 'message_received'
  | 'message_sent'
  | 'file_created'
  | 'file_updated'
  | 'file_deleted'
  | 'calendar_event_created'
  | 'calendar_event_updated'
  | 'calendar_event_deleted'
  | 'repository_event'
  | 'deployment_event'
  | 'payment_event'
  | 'alert_event'
  | 'custom';

export type IntegrationAutomationPolicy =
  | 'disabled'
  | 'manual_only'
  | 'ask_before_action'
  | 'allow_safe_actions'
  | 'allow_approved_actions'
  | 'custom';

export type IntegrationNotificationLevel =
  | 'none'
  | 'errors_only'
  | 'important'
  | 'normal'
  | 'verbose';

export type IntegrationSecretReference = {
  secretId?: string;
  secretName?: string;
  vaultPath?: string;
  keyId?: string;
  provider?: 'vault' | 'cloudflare' | 'aws_kms' | 'gcp_kms' | 'azure_key_vault' | 'local' | 'custom';
};

export type IntegrationScope = {
  name: string;
  displayName?: string;
  description?: string;
  permissionLevel?: IntegrationPermissionLevel;
  sensitivity?: IntegrationScopeSensitivity;
  granted?: boolean;
  grantedAt?: string;
  expiresAt?: string;
};

export type IntegrationOAuthMetadata = {
  clientId?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  redirectUri?: string;
  scopes?: IntegrationScope[];
  tokenType?: 'bearer' | 'mac' | 'jwt' | 'custom';
  expiresAt?: string;
  refreshExpiresAt?: string;
  lastRefreshedAt?: string;
  secretRef?: IntegrationSecretReference;
};

export type IntegrationApiKeyMetadata = {
  keyName?: string;
  prefix?: string;
  expiresAt?: string;
  lastRotatedAt?: string;
  secretRef?: IntegrationSecretReference;
};

export type IntegrationWebhookSettings = {
  enabled?: boolean;
  endpointId?: string;
  endpointUrl?: string;
  secretRef?: IntegrationSecretReference;
  subscribedEvents?: IntegrationWebhookEvent[];
  verifySignatures?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
};

export type IntegrationSyncSettings = {
  enabled?: boolean;
  direction?: IntegrationSyncDirection;
  frequency?: IntegrationSyncFrequency;
  customIntervalMinutes?: number;
  conflictStrategy?: IntegrationConflictStrategy;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  lastSyncedAt?: string;
  nextSyncAt?: string;
};

export type IntegrationPermissionSettings = {
  dataAccessLevel?: IntegrationDataAccessLevel;
  automationPolicy?: IntegrationAutomationPolicy;
  allowRead?: boolean;
  allowWrite?: boolean;
  allowDelete?: boolean;
  allowExternalSideEffects?: boolean;
  allowSensitiveDataAccess?: boolean;
  allowBackgroundSync?: boolean;
  allowWebhookEvents?: boolean;
  allowedScopes?: string[];
  blockedScopes?: string[];
};

export type IntegrationHealthSettings = {
  status?: IntegrationConnectionStatus;
  lastCheckedAt?: string;
  lastSuccessfulRequestAt?: string;
  lastErrorAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  consecutiveFailures?: number;
  notificationLevel?: IntegrationNotificationLevel;
};

export type IntegrationConnectedAccount = {
  id?: string;
  provider: IntegrationProvider;
  providerCategory?: IntegrationProviderCategory;
  displayName?: string;
  accountId?: string;
  accountEmail?: string;
  accountUsername?: string;
  accountAvatarUrl?: string;
  authType?: IntegrationAuthType;
  status?: IntegrationConnectionStatus;
  connectedAt?: string;
  disconnectedAt?: string;
  oauth?: IntegrationOAuthMetadata;
  apiKey?: IntegrationApiKeyMetadata;
  permissions?: IntegrationPermissionSettings;
  sync?: IntegrationSyncSettings;
  webhook?: IntegrationWebhookSettings;
  health?: IntegrationHealthSettings;
  metadata?: Record<string, unknown>;
};

export type IntegrationProviderDefaults = {
  provider: IntegrationProvider;
  enabled?: boolean;
  category?: IntegrationProviderCategory;
  defaultAuthType?: IntegrationAuthType;
  defaultPermissionLevel?: IntegrationPermissionLevel;
  defaultDataAccessLevel?: IntegrationDataAccessLevel;
  defaultSyncDirection?: IntegrationSyncDirection;
  defaultSyncFrequency?: IntegrationSyncFrequency;
  requiresReauthForScopeChanges?: boolean;
  supportsWebhooks?: boolean;
  supportsBackgroundSync?: boolean;
  supportsIncrementalSync?: boolean;
};

export type IntegrationGlobalSettings = {
  mode?: IntegrationPreferenceMode;
  allowNewConnections?: boolean;
  allowOAuthConnections?: boolean;
  allowApiKeyConnections?: boolean;
  allowServiceAccounts?: boolean;
  allowCustomIntegrations?: boolean;
  requireConfirmationForNewScopes?: boolean;
  requireConfirmationForSensitiveScopes?: boolean;
  requireReauthForSensitiveActions?: boolean;
  preferLeastPrivilegeScopes?: boolean;
  autoDisableFailingConnections?: boolean;
  autoDisableAfterFailureCount?: number;
};

export type IntegrationUserSettings = {
  mode?: IntegrationPreferenceMode;
  global?: IntegrationGlobalSettings;
  providerDefaults?: Partial<Record<IntegrationProvider, IntegrationProviderDefaults>>;
  connectedAccounts?: IntegrationConnectedAccount[];
};

export type IntegrationUserSettingsPatch = {
  mode?: IntegrationPreferenceMode;
  global?: Partial<IntegrationGlobalSettings>;
  providerDefaults?: Partial<Record<IntegrationProvider, Partial<IntegrationProviderDefaults>>>;
  connectedAccounts?: Array<Partial<IntegrationConnectedAccount>>;
};
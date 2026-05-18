// libs/db/src/types/user-settings/account.type.ts

export type AccountPreferenceMode = 'system' | 'enabled' | 'disabled';

export type AccountLifecycleStatus =
  | 'pending_setup'
  | 'active'
  | 'inactive'
  | 'restricted'
  | 'suspended'
  | 'scheduled_for_deletion'
  | 'deleted'
  | 'archived';

export type AccountType =
  | 'personal'
  | 'business'
  | 'organization_member'
  | 'service'
  | 'developer'
  | 'admin'
  | 'test';

export type AccountTier =
  | 'free'
  | 'basic'
  | 'basic_plus'
  | 'premium'
  | 'premium_plus'
  | 'pro'
  | 'enterprise';

export type AccountOnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'dismissed';

export type AccountDeletionPreference =
  | 'disabled'
  | 'soft_delete'
  | 'delete_after_retention'
  | 'immediate_delete'
  | 'anonymize';

export type AccountExportFormat =
  | 'json'
  | 'csv'
  | 'zip'
  | 'markdown'
  | 'html'
  | 'pdf';

export type AccountExportScope =
  | 'profile'
  | 'settings'
  | 'memory'
  | 'conversations'
  | 'files'
  | 'analytics'
  | 'automations'
  | 'integrations'
  | 'audit_log'
  | 'all';

export type AccountContactPreference =
  | 'email'
  | 'phone'
  | 'sms'
  | 'in_app'
  | 'none';

export type AccountOwnershipType =
  | 'individual'
  | 'organization_owned'
  | 'managed'
  | 'custodial'
  | 'service_account';

export type AccountLegalAcceptance = {
  version: string;
  acceptedAt: string;
  ipAddress?: string;
  userAgent?: string;
  locale?: string;
  source?: string;
};

export type AccountOnboardingStep = {
  key: string;
  status: AccountOnboardingStatus;
  completedAt?: string;
  skippedAt?: string;
};

export type AccountExportRequest = {
  id?: string;
  format: AccountExportFormat;
  scopes: AccountExportScope[];
  requestedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  downloadUrl?: string;
};

export type AccountDeletionRequest = {
  id?: string;
  preference: AccountDeletionPreference;
  requestedAt?: string;
  scheduledFor?: string;
  cancelledAt?: string;
  completedAt?: string;
  reason?: string;
};

export type AccountLifecycleSettings = {
  status?: AccountLifecycleStatus;
  accountType?: AccountType;
  ownershipType?: AccountOwnershipType;
  tier?: AccountTier;
  createdAt?: string;
  activatedAt?: string;
  deactivatedAt?: string;
  archivedAt?: string;
  lastReviewedAt?: string;
};

export type AccountOnboardingSettings = {
  status?: AccountOnboardingStatus;
  startedAt?: string;
  completedAt?: string;
  skippedAt?: string;
  currentStep?: string;
  steps?: AccountOnboardingStep[];
  showWelcomeTips?: boolean;
  showSetupChecklist?: boolean;
};

export type AccountContactSettings = {
  preferredContactMethod?: AccountContactPreference;
  primaryEmailId?: string;
  primaryPhoneId?: string;
  backupEmailId?: string;
  backupPhoneId?: string;
  allowAccountNotices?: boolean;
  allowProductUpdates?: boolean;
  allowBillingNotices?: boolean;
  allowSecurityNotices?: boolean;
};

export type AccountLegalSettings = {
  termsOfService?: AccountLegalAcceptance;
  privacyPolicy?: AccountLegalAcceptance;
  cookiePolicy?: AccountLegalAcceptance;
  dataProcessingAgreement?: AccountLegalAcceptance;
  acceptableUsePolicy?: AccountLegalAcceptance;
  marketingConsent?: AccountLegalAcceptance;
};

export type AccountDataSettings = {
  defaultExportFormat?: AccountExportFormat;
  allowedExportScopes?: AccountExportScope[];
  exportRequests?: AccountExportRequest[];
  deletionPreference?: AccountDeletionPreference;
  deletionRequest?: AccountDeletionRequest;
  allowSelfServiceExport?: boolean;
  allowSelfServiceDeletion?: boolean;
  retainAuditLogsAfterDeletion?: boolean;
};

export type AccountOrganizationSettings = {
  defaultOrganizationId?: string;
  defaultWorkspaceId?: string;
  allowOrganizationInvites?: boolean;
  allowWorkspaceInvites?: boolean;
  showOrganizationSwitcher?: boolean;
  rememberLastOrganization?: boolean;
};

export type AccountBetaSettings = {
  enrolled?: boolean;
  enrolledAt?: string;
  channels?: Array<'stable' | 'beta' | 'preview' | 'experimental' | 'canary'>;
  allowExperimentalFeatures?: boolean;
  allowFeatureFeedbackPrompts?: boolean;
};

export type AccountUserSettings = {
  mode?: AccountPreferenceMode;
  lifecycle?: AccountLifecycleSettings;
  onboarding?: AccountOnboardingSettings;
  contact?: AccountContactSettings;
  legal?: AccountLegalSettings;
  data?: AccountDataSettings;
  organization?: AccountOrganizationSettings;
  beta?: AccountBetaSettings;
};

export type AccountUserSettingsPatch = {
  mode?: AccountPreferenceMode;
  lifecycle?: Partial<AccountLifecycleSettings>;
  onboarding?: Partial<AccountOnboardingSettings>;
  contact?: Partial<AccountContactSettings>;
  legal?: Partial<AccountLegalSettings>;
  data?: Partial<AccountDataSettings>;
  organization?: Partial<AccountOrganizationSettings>;
  beta?: Partial<AccountBetaSettings>;
};
// libs/db/src/types/user-settings/privacy.type.ts

import type { ProfileFieldVisibility } from '../../enums/profile-field-visibility.enum';
import type { ProfileVisibility } from '../../enums/profile-visibility.enum';

export type PrivacyPreferenceMode = 'system' | 'enabled' | 'disabled';

export type PrivacyConsentState =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'withdrawn'
  | 'expired';

export type PrivacyProcessingBasis =
  | 'unknown'
  | 'consent'
  | 'contract'
  | 'legal_obligation'
  | 'vital_interests'
  | 'public_task'
  | 'legitimate_interests';

export type PrivacyDataRetentionPreference =
  | 'default'
  | 'minimal'
  | 'standard'
  | 'extended'
  | 'until_deleted'
  | 'custom';

export type PrivacyPersonalizationLevel =
  | 'off'
  | 'minimal'
  | 'standard'
  | 'enhanced'
  | 'custom';

export type PrivacyAnalyticsLevel =
  | 'off'
  | 'essential'
  | 'privacy_preserving'
  | 'standard'
  | 'enhanced';

export type PrivacyDataSharingLevel =
  | 'none'
  | 'essential'
  | 'service_providers'
  | 'trusted_partners'
  | 'custom';

export type PrivacySearchIndexingPreference =
  | 'disabled'
  | 'profile_only'
  | 'public_content'
  | 'all_public_data';

export type PrivacyDiscoveryPreference =
  | 'hidden'
  | 'handle_only'
  | 'connections_only'
  | 'organization_only'
  | 'public';

export type PrivacyDataRightRequestType =
  | 'access'
  | 'rectification'
  | 'erasure'
  | 'restriction'
  | 'portability'
  | 'objection'
  | 'withdraw_consent'
  | 'opt_out_sale'
  | 'opt_out_sharing'
  | 'limit_sensitive_data'
  | 'automated_decision_review';

export type PrivacyDataRightRequestStatus =
  | 'draft'
  | 'submitted'
  | 'verifying_identity'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type PrivacyConsentRecord = {
  key: string;
  state: PrivacyConsentState;
  processingBasis?: PrivacyProcessingBasis;
  grantedAt?: string;
  deniedAt?: string;
  withdrawnAt?: string;
  expiresAt?: string;
  source?: string;
  version?: string;
};

export type PrivacyDataRightRequest = {
  id?: string;
  type: PrivacyDataRightRequestType;
  status: PrivacyDataRightRequestStatus;
  requestedAt?: string;
  completedAt?: string;
  verificationRequired?: boolean;
  notes?: string;
};

export type PrivacyProfileSettings = {
  visibility?: ProfileVisibility;
  fieldVisibility?: Partial<Record<string, ProfileFieldVisibility>>;
  showOnlineStatus?: boolean;
  showLastSeen?: boolean;
  showJoinedDate?: boolean;
  showLocation?: boolean;
  showCountry?: boolean;
  showPronouns?: boolean;
  showLanguages?: boolean;
  allowProfileSearch?: boolean;
  allowProfileIndexing?: boolean;
  searchIndexing?: PrivacySearchIndexingPreference;
  discovery?: PrivacyDiscoveryPreference;
};

export type PrivacyCommunicationSettings = {
  allowDirectMessages?: boolean;
  allowConnectionRequests?: boolean;
  allowMentions?: boolean;
  allowTagging?: boolean;
  allowInvites?: boolean;
  allowOrganizationDiscovery?: boolean;
  allowReadReceipts?: boolean;
  allowTypingIndicators?: boolean;
};

export type PrivacyDataSettings = {
  dataRetention?: PrivacyDataRetentionPreference;
  customRetentionDays?: number;
  minimizeDataCollection?: boolean;
  autoDeleteInactiveSessions?: boolean;
  inactiveSessionRetentionDays?: number;
  allowDataExport?: boolean;
  allowAccountDeletion?: boolean;
  allowDataCorrection?: boolean;
  allowDataPortability?: boolean;
};

export type PrivacyConsentSettings = {
  required?: PrivacyConsentRecord[];
  optional?: PrivacyConsentRecord[];
  marketing?: PrivacyConsentRecord;
  analytics?: PrivacyConsentRecord;
  personalization?: PrivacyConsentRecord;
  aiPersonalization?: PrivacyConsentRecord;
  productImprovement?: PrivacyConsentRecord;
  thirdPartySharing?: PrivacyConsentRecord;
  sensitiveDataProcessing?: PrivacyConsentRecord;
};

export type PrivacyAnalyticsSettings = {
  analyticsLevel?: PrivacyAnalyticsLevel;
  allowProductAnalytics?: boolean;
  allowCrashReports?: boolean;
  allowPerformanceTelemetry?: boolean;
  allowUsageTelemetry?: boolean;
  allowExperimentation?: boolean;
  anonymizeTelemetry?: boolean;
};

export type PrivacyPersonalizationSettings = {
  personalizationLevel?: PrivacyPersonalizationLevel;
  allowMemoryPersonalization?: boolean;
  allowBehaviorPersonalization?: boolean;
  allowContentPersonalization?: boolean;
  allowRecommendationPersonalization?: boolean;
  allowLocationPersonalization?: boolean;
  allowCrossDevicePersonalization?: boolean;
};

export type PrivacyAiSettings = {
  allowAiMemory?: boolean;
  allowAiContextReuse?: boolean;
  allowAiTraining?: boolean;
  allowHumanReview?: boolean;
  allowAutomatedDecisionMaking?: boolean;
  requireHumanReviewForSensitiveDecisions?: boolean;
  allowSensitiveDataInPrompts?: boolean;
  redactSensitiveDataByDefault?: boolean;
};

export type PrivacySharingSettings = {
  dataSharingLevel?: PrivacyDataSharingLevel;
  allowServiceProviderSharing?: boolean;
  allowPartnerSharing?: boolean;
  allowSaleOfPersonalData?: boolean;
  allowSharingForTargetedAds?: boolean;
  allowSensitiveDataSharing?: boolean;
  globalPrivacyControlEnabled?: boolean;
};

export type PrivacySecuritySettings = {
  hideEmail?: boolean;
  hidePhone?: boolean;
  maskSensitiveFields?: boolean;
  requireReauthenticationForSensitiveData?: boolean;
  notifyOnPrivacyChanges?: boolean;
  notifyOnDataExport?: boolean;
  notifyOnAccountDeletion?: boolean;
};

export type PrivacyUserSettings = {
  mode?: PrivacyPreferenceMode;
  profile?: PrivacyProfileSettings;
  communication?: PrivacyCommunicationSettings;
  data?: PrivacyDataSettings;
  consent?: PrivacyConsentSettings;
  analytics?: PrivacyAnalyticsSettings;
  personalization?: PrivacyPersonalizationSettings;
  ai?: PrivacyAiSettings;
  sharing?: PrivacySharingSettings;
  security?: PrivacySecuritySettings;
  dataRightRequests?: PrivacyDataRightRequest[];
};

export type PrivacyUserSettingsPatch = {
  mode?: PrivacyPreferenceMode;
  profile?: Partial<PrivacyProfileSettings>;
  communication?: Partial<PrivacyCommunicationSettings>;
  data?: Partial<PrivacyDataSettings>;
  consent?: Partial<PrivacyConsentSettings>;
  analytics?: Partial<PrivacyAnalyticsSettings>;
  personalization?: Partial<PrivacyPersonalizationSettings>;
  ai?: Partial<PrivacyAiSettings>;
  sharing?: Partial<PrivacySharingSettings>;
  security?: Partial<PrivacySecuritySettings>;
  dataRightRequests?: Array<Partial<PrivacyDataRightRequest>>;
};
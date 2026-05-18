// libs/db/src/types/user-settings/memory.type.ts

export type MemoryPreferenceMode = 'system' | 'enabled' | 'disabled';

export type MemoryScope =
  | 'user'
  | 'assistant_identity'
  | 'organization'
  | 'workspace'
  | 'project'
  | 'conversation'
  | 'automation'
  | 'analytics'
  | 'infrastructure'
  | 'custom';

export type MemoryCategory =
  | 'preference'
  | 'identity'
  | 'profile'
  | 'relationship'
  | 'project'
  | 'task'
  | 'workflow'
  | 'technical'
  | 'infrastructure'
  | 'business'
  | 'creative'
  | 'health'
  | 'financial'
  | 'legal'
  | 'education'
  | 'travel'
  | 'shopping'
  | 'food'
  | 'safety'
  | 'secret_reference'
  | 'custom';

export type MemorySensitivity =
  | 'public'
  | 'personal'
  | 'private'
  | 'sensitive'
  | 'business'
  | 'technical'
  | 'restricted'
  | 'regulated'
  | 'secret_reference';

export type MemorySaveBehavior =
  | 'never'
  | 'ask_every_time'
  | 'auto_low_risk'
  | 'auto_preferences_only'
  | 'auto_project_context'
  | 'auto_all_allowed'
  | 'custom';

export type MemoryRecallBehavior =
  | 'never'
  | 'ask_before_using'
  | 'use_when_relevant'
  | 'use_for_personalization'
  | 'use_for_project_context'
  | 'custom';

export type MemoryReviewFrequency =
  | 'never'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom';

export type MemoryRetentionPolicy =
  | 'session_only'
  | 'until_conversation_ends'
  | 'until_project_ends'
  | 'fixed_duration'
  | 'until_deleted'
  | 'forever'
  | 'custom';

export type MemoryConflictStrategy =
  | 'keep_existing'
  | 'replace_existing'
  | 'keep_both'
  | 'newest_wins'
  | 'highest_confidence_wins'
  | 'ask_user'
  | 'custom';

export type MemoryConfidenceThreshold =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'very_high';

export type MemorySourceType =
  | 'user_explicit'
  | 'user_implicit'
  | 'assistant_inferred'
  | 'uploaded_file'
  | 'email'
  | 'calendar'
  | 'contact'
  | 'integration'
  | 'automation'
  | 'system'
  | 'admin'
  | 'custom';

export type MemoryExportFormat =
  | 'json'
  | 'csv'
  | 'markdown'
  | 'html'
  | 'zip';

export type MemoryDeletionBehavior =
  | 'soft_delete'
  | 'hard_delete'
  | 'anonymize'
  | 'tombstone'
  | 'custom';

export type MemoryPermissionMode =
  | 'disabled'
  | 'read_only'
  | 'write_only'
  | 'read_write'
  | 'ask_before_read'
  | 'ask_before_write'
  | 'custom';

export type MemoryScopePermission = {
  scope: MemoryScope;
  mode: MemoryPermissionMode;
  allowSensitive?: boolean;
  allowedCategories?: MemoryCategory[];
  blockedCategories?: MemoryCategory[];
  maxSensitivity?: MemorySensitivity;
};

export type MemoryCategoryRule = {
  category: MemoryCategory;
  enabled?: boolean;
  saveBehavior?: MemorySaveBehavior;
  recallBehavior?: MemoryRecallBehavior;
  retentionPolicy?: MemoryRetentionPolicy;
  retentionDays?: number;
  sensitivity?: MemorySensitivity;
  requireApproval?: boolean;
};

export type MemorySensitivityRule = {
  sensitivity: MemorySensitivity;
  enabled?: boolean;
  saveBehavior?: MemorySaveBehavior;
  recallBehavior?: MemoryRecallBehavior;
  retentionPolicy?: MemoryRetentionPolicy;
  retentionDays?: number;
  requireApprovalToSave?: boolean;
  requireApprovalToUse?: boolean;
  requireReauthenticationToView?: boolean;
};

export type MemorySourceRule = {
  sourceType: MemorySourceType;
  enabled?: boolean;
  allowSave?: boolean;
  allowRecall?: boolean;
  requireApproval?: boolean;
  defaultSensitivity?: MemorySensitivity;
};

export type MemoryRetentionSettings = {
  defaultPolicy?: MemoryRetentionPolicy;
  defaultRetentionDays?: number;
  maxRetentionDays?: number;
  autoExpireStaleMemories?: boolean;
  staleAfterDays?: number;
  deleteExpiredMemories?: boolean;
  deletionBehavior?: MemoryDeletionBehavior;
  preserveAuditTrail?: boolean;
};

export type MemorySaveSettings = {
  behavior?: MemorySaveBehavior;
  allowImplicitMemoryCreation?: boolean;
  allowExplicitMemoryCreation?: boolean;
  allowAssistantInferences?: boolean;
  allowPreferenceMemories?: boolean;
  allowProjectMemories?: boolean;
  allowTechnicalMemories?: boolean;
  allowSensitiveMemories?: boolean;
  allowSecretReferences?: boolean;
  requireApprovalForSensitive?: boolean;
  requireApprovalForInferred?: boolean;
  requireApprovalForCrossScope?: boolean;
  minimumConfidenceToSave?: MemoryConfidenceThreshold;
  blockedCategories?: MemoryCategory[];
  allowedCategories?: MemoryCategory[];
};

export type MemoryRecallSettings = {
  behavior?: MemoryRecallBehavior;
  allowCrossConversationRecall?: boolean;
  allowProjectRecall?: boolean;
  allowWorkspaceRecall?: boolean;
  allowOrganizationRecall?: boolean;
  allowSensitiveRecall?: boolean;
  allowSecretReferenceRecall?: boolean;
  requireApprovalForSensitiveRecall?: boolean;
  requireApprovalForCrossScopeRecall?: boolean;
  minimumConfidenceToRecall?: MemoryConfidenceThreshold;
  maxMemoriesPerResponse?: number;
  showWhenMemoryWasUsed?: boolean;
  explainMemoryInfluence?: boolean;
};

export type MemoryReviewSettings = {
  enabled?: boolean;
  frequency?: MemoryReviewFrequency;
  customReviewIntervalDays?: number;
  remindToReview?: boolean;
  showNewMemories?: boolean;
  showUpdatedMemories?: boolean;
  showStaleMemories?: boolean;
  showLowConfidenceMemories?: boolean;
  allowBulkApprove?: boolean;
  allowBulkDelete?: boolean;
  allowBulkExport?: boolean;
};

export type MemoryConflictSettings = {
  strategy?: MemoryConflictStrategy;
  detectContradictions?: boolean;
  detectDuplicates?: boolean;
  detectStaleMemories?: boolean;
  askBeforeReplacing?: boolean;
  preservePreviousVersions?: boolean;
  versionMemoryUpdates?: boolean;
};

export type MemoryPrivacySettings = {
  allowMemorySearch?: boolean;
  allowMemoryExport?: boolean;
  allowMemoryDeletion?: boolean;
  allowMemoryPause?: boolean;
  allowTemporaryChats?: boolean;
  redactSensitiveByDefault?: boolean;
  requireReauthenticationToManage?: boolean;
  notifyOnMemoryCreated?: boolean;
  notifyOnMemoryUpdated?: boolean;
  notifyOnMemoryDeleted?: boolean;
};

export type MemoryScopeSettings = {
  defaultScope?: MemoryScope;
  scopePermissions?: MemoryScopePermission[];
  isolateOrganizationMemory?: boolean;
  isolateWorkspaceMemory?: boolean;
  isolateProjectMemory?: boolean;
  allowCrossProjectMemory?: boolean;
  allowCrossOrganizationMemory?: boolean;
};

export type MemoryRuleSettings = {
  categories?: Partial<Record<MemoryCategory, MemoryCategoryRule>>;
  sensitivity?: Partial<Record<MemorySensitivity, MemorySensitivityRule>>;
  sources?: Partial<Record<MemorySourceType, MemorySourceRule>>;
};

export type MemoryExportSettings = {
  defaultFormat?: MemoryExportFormat;
  allowedFormats?: MemoryExportFormat[];
  includeMetadata?: boolean;
  includeAuditHistory?: boolean;
  includeDeletedTombstones?: boolean;
  includeEmbeddings?: boolean;
};

export type MemoryUserSettings = {
  mode?: MemoryPreferenceMode;
  save?: MemorySaveSettings;
  recall?: MemoryRecallSettings;
  retention?: MemoryRetentionSettings;
  review?: MemoryReviewSettings;
  conflicts?: MemoryConflictSettings;
  privacy?: MemoryPrivacySettings;
  scope?: MemoryScopeSettings;
  rules?: MemoryRuleSettings;
  export?: MemoryExportSettings;
};

export type MemoryUserSettingsPatch = {
  mode?: MemoryPreferenceMode;
  save?: Partial<MemorySaveSettings>;
  recall?: Partial<MemoryRecallSettings>;
  retention?: Partial<MemoryRetentionSettings>;
  review?: Partial<MemoryReviewSettings>;
  conflicts?: Partial<MemoryConflictSettings>;
  privacy?: Partial<MemoryPrivacySettings>;
  scope?: Partial<MemoryScopeSettings>;
  rules?: Partial<MemoryRuleSettings>;
  export?: Partial<MemoryExportSettings>;
};
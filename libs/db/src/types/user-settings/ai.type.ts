// libs/db/src/types/user-settings/ai.type.ts

export type AiPreferenceMode = 'system' | 'enabled' | 'disabled';

export type AiProviderPreference =
  | 'auto'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'meta'
  | 'xai'
  | 'cloudflare'
  | 'local'
  | 'self_hosted'
  | 'custom';

export type AiModelRoutingMode =
  | 'auto'
  | 'balanced'
  | 'lowest_cost'
  | 'lowest_latency'
  | 'highest_quality'
  | 'privacy_first'
  | 'local_first'
  | 'cloud_first'
  | 'offline_only'
  | 'custom';

export type AiReasoningEffort =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

export type AiVerbosity = 'minimal' | 'concise' | 'normal' | 'detailed' | 'exhaustive';

export type AiTone =
  | 'system_default'
  | 'professional'
  | 'friendly'
  | 'casual'
  | 'technical'
  | 'mentor'
  | 'coach'
  | 'direct'
  | 'supportive'
  | 'custom';

export type AiPersonalityMode =
  | 'system_default'
  | 'professional'
  | 'personal'
  | 'developer'
  | 'coach'
  | 'mentor'
  | 'secretary'
  | 'companion'
  | 'custom';

export type AiAutonomyLevel =
  | 'manual_only'
  | 'suggest_only'
  | 'ask_before_action'
  | 'auto_low_risk'
  | 'auto_approved_actions'
  | 'fully_supervised'
  | 'custom';

export type AiToolPermissionMode =
  | 'disabled'
  | 'ask_every_time'
  | 'allow_approved'
  | 'allow_low_risk'
  | 'allow_all'
  | 'custom';

export type AiToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type AiToolCategory =
  | 'web_search'
  | 'file_search'
  | 'code_execution'
  | 'calendar'
  | 'email'
  | 'contacts'
  | 'documents'
  | 'spreadsheets'
  | 'slides'
  | 'images'
  | 'github'
  | 'google_drive'
  | 'dropbox'
  | 'automation'
  | 'database'
  | 'infrastructure'
  | 'payments'
  | 'custom';

export type AiConfirmationPolicy =
  | 'never'
  | 'destructive_actions'
  | 'external_side_effects'
  | 'sensitive_data'
  | 'high_risk_actions'
  | 'always';

export type AiCitationPreference =
  | 'never'
  | 'when_browsed'
  | 'factual_claims'
  | 'technical_claims'
  | 'always'
  | 'custom';

export type AiExplanationPreference =
  | 'none'
  | 'brief'
  | 'normal'
  | 'detailed'
  | 'step_by_step'
  | 'custom';

export type AiSafetyLevel =
  | 'standard'
  | 'strict'
  | 'enterprise'
  | 'developer'
  | 'custom';

export type AiDataSensitivityHandling =
  | 'standard'
  | 'redact_sensitive'
  | 'ask_before_using_sensitive'
  | 'never_use_sensitive'
  | 'custom';

export type AiContextSharingMode =
  | 'session_only'
  | 'project'
  | 'workspace'
  | 'organization'
  | 'cross_device'
  | 'disabled'
  | 'custom';

export type AiPromptInjectionProtection =
  | 'standard'
  | 'strict'
  | 'paranoid'
  | 'custom';

export type AiOutputFormatPreference =
  | 'auto'
  | 'plain_text'
  | 'markdown'
  | 'json'
  | 'yaml'
  | 'code_first'
  | 'tables'
  | 'checklists'
  | 'custom';

export type AiCodeStylePreference = {
  language?: string;
  framework?: string;
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'cargo' | 'pip' | 'uv' | 'poetry' | 'custom';
  moduleSystem?: 'esm' | 'commonjs' | 'auto';
  indentation?: 'tabs' | 'spaces_2' | 'spaces_4' | 'project_default';
  semicolons?: 'always' | 'never' | 'project_default';
  quotes?: 'single' | 'double' | 'project_default';
  includeComments?: boolean;
  returnFullFiles?: boolean;
  preferPatchDiffs?: boolean;
};

export type AiToolPermission = {
  category: AiToolCategory;
  mode: AiToolPermissionMode;
  maxRiskLevel?: AiToolRiskLevel;
  requireConfirmation?: AiConfirmationPolicy;
  allowedToolNames?: string[];
  blockedToolNames?: string[];
};

export type AiModelPreference = {
  provider?: AiProviderPreference;
  model?: string;
  fallbackModel?: string;
  routingMode?: AiModelRoutingMode;
  reasoningEffort?: AiReasoningEffort;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
};

export type AiBehaviorSettings = {
  tone?: AiTone;
  personalityMode?: AiPersonalityMode;
  customPersonalityId?: string;
  verbosity?: AiVerbosity;
  explanationPreference?: AiExplanationPreference;
  outputFormat?: AiOutputFormatPreference;
  preferActionableSteps?: boolean;
  preferConciseAnswers?: boolean;
  preferEducationalAnswers?: boolean;
  preferSourceCitations?: boolean;
  askClarifyingQuestions?: boolean;
  maxClarifyingQuestions?: number;
};

export type AiAutonomySettings = {
  level?: AiAutonomyLevel;
  defaultConfirmationPolicy?: AiConfirmationPolicy;
  allowExternalSideEffects?: boolean;
  allowDestructiveActions?: boolean;
  allowPurchases?: boolean;
  allowSendingMessages?: boolean;
  allowScheduling?: boolean;
  allowFileModifications?: boolean;
  allowRepositoryChanges?: boolean;
  requireConfirmationAboveRisk?: AiToolRiskLevel;
};

export type AiToolSettings = {
  mode?: AiToolPermissionMode;
  permissions?: AiToolPermission[];
  blockedCategories?: AiToolCategory[];
  allowedCategories?: AiToolCategory[];
  allowCustomTools?: boolean;
  allowConnectorTools?: boolean;
  allowCodeExecution?: boolean;
  allowNetworkAccess?: boolean;
  allowFileAccess?: boolean;
  allowSecretsAccess?: boolean;
};

export type AiSafetySettings = {
  level?: AiSafetyLevel;
  promptInjectionProtection?: AiPromptInjectionProtection;
  dataSensitivityHandling?: AiDataSensitivityHandling;
  blockUnsafeRequests?: boolean;
  redactSecretsByDefault?: boolean;
  redactPersonalDataByDefault?: boolean;
  requireCitationsForFactualClaims?: boolean;
  requireSourceAttribution?: boolean;
  warnOnUnverifiedClaims?: boolean;
  allowMedicalGeneralInfo?: boolean;
  allowLegalGeneralInfo?: boolean;
  allowFinancialGeneralInfo?: boolean;
};

export type AiPrivacySettings = {
  allowPersonalization?: boolean;
  allowContextReuse?: boolean;
  contextSharingMode?: AiContextSharingMode;
  allowSensitiveContext?: boolean;
  allowCrossConversationContext?: boolean;
  allowProjectContext?: boolean;
  allowOrganizationContext?: boolean;
  allowTelemetryForQuality?: boolean;
  allowHumanReview?: boolean;
  allowTrainingUse?: boolean;
};

export type AiMemoryInteractionSettings = {
  allowMemoryLookup?: boolean;
  allowMemoryWriteSuggestions?: boolean;
  autoSaveLowRiskPreferences?: boolean;
  askBeforeSavingSensitiveMemory?: boolean;
  showMemoryUsageIndicators?: boolean;
  explainWhenMemoryInfluencedAnswer?: boolean;
};

export type AiCitationsSettings = {
  preference?: AiCitationPreference;
  citeWebSources?: boolean;
  citeFiles?: boolean;
  citeEmails?: boolean;
  citeCalendarEvents?: boolean;
  citeInternalDocs?: boolean;
  minimumSourceQuality?: 'any' | 'standard' | 'high' | 'authoritative';
};

export type AiDeveloperSettings = {
  codeStyle?: AiCodeStylePreference;
  preferFullFileOutput?: boolean;
  preferMinimalDiffs?: boolean;
  preferTestsWithCode?: boolean;
  preferTypeSafety?: boolean;
  preferSecurityNotes?: boolean;
  preferPerformanceNotes?: boolean;
  defaultRepositoryPath?: string;
};

export type AiUserSettings = {
  mode?: AiPreferenceMode;
  model?: AiModelPreference;
  behavior?: AiBehaviorSettings;
  autonomy?: AiAutonomySettings;
  tools?: AiToolSettings;
  safety?: AiSafetySettings;
  privacy?: AiPrivacySettings;
  memory?: AiMemoryInteractionSettings;
  citations?: AiCitationsSettings;
  developer?: AiDeveloperSettings;
};

export type AiUserSettingsPatch = {
  mode?: AiPreferenceMode;
  model?: Partial<AiModelPreference>;
  behavior?: Partial<AiBehaviorSettings>;
  autonomy?: Partial<AiAutonomySettings>;
  tools?: Partial<AiToolSettings>;
  safety?: Partial<AiSafetySettings>;
  privacy?: Partial<AiPrivacySettings>;
  memory?: Partial<AiMemoryInteractionSettings>;
  citations?: Partial<AiCitationsSettings>;
  developer?: Partial<AiDeveloperSettings>;
};
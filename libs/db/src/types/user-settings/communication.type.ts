// libs/db/src/types/user-settings/communication.type.ts

export type CommunicationPreferenceMode = 'system' | 'enabled' | 'disabled';

export type CommunicationTone =
  | 'system_default'
  | 'professional'
  | 'friendly'
  | 'casual'
  | 'direct'
  | 'warm'
  | 'formal'
  | 'relaxed'
  | 'technical'
  | 'mentor'
  | 'coach'
  | 'secretary'
  | 'supportive'
  | 'custom';

export type CommunicationVerbosity =
  | 'minimal'
  | 'concise'
  | 'normal'
  | 'detailed'
  | 'exhaustive'
  | 'custom';

export type CommunicationCadence =
  | 'minimal'
  | 'low'
  | 'normal'
  | 'high'
  | 'step_by_step'
  | 'custom';

export type CommunicationReadingLevel =
  | 'simple'
  | 'plain_language'
  | 'standard'
  | 'technical'
  | 'expert'
  | 'custom';

export type CommunicationFeedbackStyle =
  | 'none'
  | 'gentle'
  | 'direct'
  | 'coaching'
  | 'mentor'
  | 'critical_review'
  | 'custom';

export type CommunicationClarificationStyle =
  | 'avoid_when_possible'
  | 'ask_one_question'
  | 'ask_multiple_questions'
  | 'make_reasonable_assumptions'
  | 'always_confirm'
  | 'custom';

export type CommunicationInterruptionLevel =
  | 'none'
  | 'critical_only'
  | 'important_only'
  | 'normal'
  | 'all'
  | 'custom';

export type CommunicationQuietModeBehavior =
  | 'silence_all'
  | 'allow_critical'
  | 'allow_urgent'
  | 'summarize_later'
  | 'digest_only';

export type CommunicationChannel =
  | 'in_app'
  | 'email'
  | 'sms'
  | 'push'
  | 'discord'
  | 'slack'
  | 'webhook'
  | 'voice'
  | 'custom';

export type CommunicationResponseFormat =
  | 'auto'
  | 'paragraphs'
  | 'bullets'
  | 'checklist'
  | 'table'
  | 'code_first'
  | 'summary_then_details'
  | 'custom';

export type CommunicationUpdateFrequency =
  | 'never'
  | 'only_long_tasks'
  | 'periodic'
  | 'frequent'
  | 'step_by_step'
  | 'custom';

export type CommunicationPersonaPreference =
  | 'system_default'
  | 'professional'
  | 'personal'
  | 'developer'
  | 'mentor'
  | 'coach'
  | 'secretary'
  | 'companion'
  | 'custom';

export type CommunicationToneSettings = {
  tone?: CommunicationTone;
  persona?: CommunicationPersonaPreference;
  verbosity?: CommunicationVerbosity;
  readingLevel?: CommunicationReadingLevel;
  feedbackStyle?: CommunicationFeedbackStyle;
  responseFormat?: CommunicationResponseFormat;
  customToneInstructions?: string;
  avoidJargon?: boolean;
  explainJargon?: boolean;
  preferExamples?: boolean;
  preferActionableSteps?: boolean;
};

export type CommunicationClarificationSettings = {
  style?: CommunicationClarificationStyle;
  maxClarifyingQuestions?: number;
  allowAssumptions?: boolean;
  stateAssumptions?: boolean;
  confirmBeforeHighImpactActions?: boolean;
  confirmBeforeExternalActions?: boolean;
  confirmBeforeDestructiveActions?: boolean;
};

export type CommunicationProgressSettings = {
  cadence?: CommunicationCadence;
  updateFrequency?: CommunicationUpdateFrequency;
  updateIntervalSeconds?: number;
  showProgressForLongTasks?: boolean;
  showPartialFindings?: boolean;
  summarizeCompletedSteps?: boolean;
  includeNextSteps?: boolean;
};

export type CommunicationQuietModeSettings = {
  enabled?: boolean;
  behavior?: CommunicationQuietModeBehavior;
  timezone?: string;
  startTime?: string;
  endTime?: string;
  days?: Array<
    | 'sunday'
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
  >;
  allowedInterruptionLevel?: CommunicationInterruptionLevel;
};

export type CommunicationChannelSettings = {
  preferredChannels?: CommunicationChannel[];
  disabledChannels?: CommunicationChannel[];
  defaultChannel?: CommunicationChannel;
  allowVoice?: boolean;
  allowPush?: boolean;
  allowEmail?: boolean;
  allowSms?: boolean;
  allowWebhooks?: boolean;
};

export type CommunicationMessageSettings = {
  includeGreeting?: boolean;
  includeSignoff?: boolean;
  useMarkdown?: boolean;
  useTables?: boolean;
  useEmojis?: boolean;
  useCodeBlocksForCopyPaste?: boolean;
  preserveUserTerminology?: boolean;
  mirrorUserFormatting?: boolean;
};

export type CommunicationUserSettings = {
  mode?: CommunicationPreferenceMode;
  tone?: CommunicationToneSettings;
  clarification?: CommunicationClarificationSettings;
  progress?: CommunicationProgressSettings;
  quietMode?: CommunicationQuietModeSettings;
  channels?: CommunicationChannelSettings;
  messages?: CommunicationMessageSettings;
};

export type CommunicationUserSettingsPatch = {
  mode?: CommunicationPreferenceMode;
  tone?: Partial<CommunicationToneSettings>;
  clarification?: Partial<CommunicationClarificationSettings>;
  progress?: Partial<CommunicationProgressSettings>;
  quietMode?: Partial<CommunicationQuietModeSettings>;
  channels?: Partial<CommunicationChannelSettings>;
  messages?: Partial<CommunicationMessageSettings>;
};
// libs/db/src/types/user-settings/content.type.ts

import type { ContentMaturity } from '../../enums/content-maturity.enum';

export type ContentPreferenceMode = 'system' | 'enabled' | 'disabled';

export type ContentFilterStrictness =
  | 'off'
  | 'low'
  | 'standard'
  | 'strict'
  | 'maximum'
  | 'custom';

export type ContentSafeSearchMode =
  | 'off'
  | 'moderate'
  | 'strict'
  | 'locked'
  | 'custom';

export type ContentUserGeneratedPolicy =
  | 'allow'
  | 'allow_moderated'
  | 'hide_by_default'
  | 'block'
  | 'custom';

export type ContentSpoilerPolicy =
  | 'show'
  | 'blur'
  | 'hide'
  | 'ask_before_showing';

export type ContentAutoplayPolicy =
  | 'allow'
  | 'wifi_only'
  | 'muted_only'
  | 'disabled';

export type ContentSensitiveMediaDisplay =
  | 'show'
  | 'blur'
  | 'hide'
  | 'ask_before_showing';

export type ContentRecommendationMode =
  | 'off'
  | 'minimal'
  | 'balanced'
  | 'personalized'
  | 'exploratory'
  | 'custom';

export type ContentCategory =
  | 'adult'
  | 'nudity'
  | 'sexual_content'
  | 'suggestive_content'
  | 'violence'
  | 'graphic_violence'
  | 'blood'
  | 'gore'
  | 'horror'
  | 'self_harm'
  | 'substance_use'
  | 'alcohol'
  | 'tobacco'
  | 'drugs'
  | 'gambling'
  | 'simulated_gambling'
  | 'strong_language'
  | 'hate'
  | 'harassment'
  | 'bullying'
  | 'extremism'
  | 'weapons'
  | 'politics'
  | 'religion'
  | 'medical'
  | 'legal'
  | 'financial'
  | 'spoilers'
  | 'user_generated_content'
  | 'external_links'
  | 'ads'
  | 'tracking'
  | 'in_app_purchases';

export type ContentCategoryPolicy = {
  enabled?: boolean;
  category: ContentCategory;
  strictness?: ContentFilterStrictness;
  display?: ContentSensitiveMediaDisplay;
  minimumMaturity?: ContentMaturity;
  requireConfirmation?: boolean;
};

export type ContentKeywordRule = {
  keyword: string;
  enabled?: boolean;
  matchCase?: boolean;
  wholeWord?: boolean;
  category?: ContentCategory;
};

export type ContentTopicRule = {
  topic: string;
  enabled?: boolean;
  category?: ContentCategory;
  strictness?: ContentFilterStrictness;
};

export type ContentMaturitySettings = {
  defaultMaturity?: ContentMaturity;
  maximumMaturity?: ContentMaturity;
  requireGuardianApproval?: boolean;
  lockMaturitySettings?: boolean;
};

export type ContentFilteringSettings = {
  strictness?: ContentFilterStrictness;
  safeSearch?: ContentSafeSearchMode;
  categories?: Partial<Record<ContentCategory, ContentCategoryPolicy>>;
  blockedCategories?: ContentCategory[];
  allowedCategories?: ContentCategory[];
  blockedKeywords?: ContentKeywordRule[];
  allowedKeywords?: ContentKeywordRule[];
  blockedTopics?: ContentTopicRule[];
  allowedTopics?: ContentTopicRule[];
};

export type ContentMediaSettings = {
  sensitiveMediaDisplay?: ContentSensitiveMediaDisplay;
  autoplay?: ContentAutoplayPolicy;
  autoplayVideos?: ContentAutoplayPolicy;
  autoplayAudio?: ContentAutoplayPolicy;
  showImagePreviews?: boolean;
  showVideoPreviews?: boolean;
  showExternalEmbeds?: boolean;
  blurSensitiveImages?: boolean;
  muteVideosByDefault?: boolean;
};

export type ContentSpoilerSettings = {
  policy?: ContentSpoilerPolicy;
  hideSpoilers?: boolean;
  blurSpoilers?: boolean;
  spoilerKeywords?: string[];
  spoilerTopics?: string[];
};

export type ContentRecommendationSettings = {
  mode?: ContentRecommendationMode;
  allowPersonalizedRecommendations?: boolean;
  allowTrendingContent?: boolean;
  allowSponsoredContent?: boolean;
  allowSimilarContent?: boolean;
  excludeBlockedCategories?: boolean;
  diversifyRecommendations?: boolean;
};

export type ContentUserGeneratedSettings = {
  policy?: ContentUserGeneratedPolicy;
  allowComments?: boolean;
  allowReplies?: boolean;
  allowMentions?: boolean;
  allowCommunityPosts?: boolean;
  hideUnmoderatedContent?: boolean;
  requireVerifiedCreators?: boolean;
};

export type ContentInteractionSettings = {
  allowExternalLinks?: boolean;
  warnBeforeExternalLinks?: boolean;
  allowDownloads?: boolean;
  warnBeforeDownloads?: boolean;
  allowInAppPurchases?: boolean;
  warnBeforePurchases?: boolean;
  allowDataSharingPrompts?: boolean;
};

export type ContentUserSettings = {
  mode?: ContentPreferenceMode;
  maturity?: ContentMaturitySettings;
  filtering?: ContentFilteringSettings;
  media?: ContentMediaSettings;
  spoilers?: ContentSpoilerSettings;
  recommendations?: ContentRecommendationSettings;
  userGenerated?: ContentUserGeneratedSettings;
  interactions?: ContentInteractionSettings;
};

export type ContentUserSettingsPatch = {
  mode?: ContentPreferenceMode;
  maturity?: Partial<ContentMaturitySettings>;
  filtering?: Partial<ContentFilteringSettings>;
  media?: Partial<ContentMediaSettings>;
  spoilers?: Partial<ContentSpoilerSettings>;
  recommendations?: Partial<ContentRecommendationSettings>;
  userGenerated?: Partial<ContentUserGeneratedSettings>;
  interactions?: Partial<ContentInteractionSettings>;
};
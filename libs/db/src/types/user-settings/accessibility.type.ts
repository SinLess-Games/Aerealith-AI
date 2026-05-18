// libs/db/src/types/user-settings/accessibility.type.ts

export type AccessibilityPreferenceMode = 'system' | 'enabled' | 'disabled';

export type AccessibilityIntensity =
  | 'none'
  | 'subtle'
  | 'moderate'
  | 'strong';

export type AccessibilityFontScale =
  | 'system'
  | 'small'
  | 'normal'
  | 'large'
  | 'larger'
  | 'largest'
  | 'custom';

export type AccessibilityLineHeight =
  | 'system'
  | 'compact'
  | 'normal'
  | 'comfortable'
  | 'spacious'
  | 'custom';

export type AccessibilityLetterSpacing =
  | 'system'
  | 'normal'
  | 'wide'
  | 'wider'
  | 'widest'
  | 'custom';

export type AccessibilityContrastPreference =
  | 'system'
  | 'no_preference'
  | 'less'
  | 'more'
  | 'high'
  | 'forced'
  | 'custom';

export type AccessibilityColorSchemePreference =
  | 'system'
  | 'light'
  | 'dark'
  | 'high_contrast_light'
  | 'high_contrast_dark'
  | 'custom';

export type AccessibilityMotionPreference =
  | 'system'
  | 'no_preference'
  | 'reduce'
  | 'remove';

export type AccessibilityTransparencyPreference =
  | 'system'
  | 'no_preference'
  | 'reduce'
  | 'remove';

export type AccessibilityFocusIndicatorPreference =
  | 'system'
  | 'default'
  | 'enhanced'
  | 'high_visibility'
  | 'custom';

export type AccessibilityCursorSize =
  | 'system'
  | 'small'
  | 'normal'
  | 'large'
  | 'extra_large'
  | 'custom';

export type AccessibilityCaptionsSize =
  | 'system'
  | 'small'
  | 'normal'
  | 'large'
  | 'extra_large'
  | 'custom';

export type AccessibilityCaptionsStyle =
  | 'system'
  | 'default'
  | 'high_contrast'
  | 'large_text'
  | 'custom';

export type AccessibilityReadingGuideMode =
  | 'off'
  | 'line'
  | 'paragraph'
  | 'focus_window';

export type AccessibilityScreenReaderVerbosity =
  | 'system'
  | 'brief'
  | 'normal'
  | 'verbose';

export type AccessibilityVisualSettings = {
  colorScheme?: AccessibilityColorSchemePreference;
  contrast?: AccessibilityContrastPreference;
  forcedColors?: AccessibilityPreferenceMode;
  invertColors?: AccessibilityPreferenceMode;
  reducedTransparency?: AccessibilityTransparencyPreference;
  fontScale?: AccessibilityFontScale;
  customFontScale?: number;
  lineHeight?: AccessibilityLineHeight;
  customLineHeight?: number;
  letterSpacing?: AccessibilityLetterSpacing;
  customLetterSpacing?: number;
  dyslexiaFriendlyFont?: AccessibilityPreferenceMode;
  underlineLinks?: AccessibilityPreferenceMode;
  showButtonBorders?: AccessibilityPreferenceMode;
  focusIndicator?: AccessibilityFocusIndicatorPreference;
  cursorSize?: AccessibilityCursorSize;
};

export type AccessibilityMotionSettings = {
  reducedMotion?: AccessibilityMotionPreference;
  disableAutoplay?: AccessibilityPreferenceMode;
  disableParallax?: AccessibilityPreferenceMode;
  disableAnimatedBackgrounds?: AccessibilityPreferenceMode;
  disablePageTransitions?: AccessibilityPreferenceMode;
  animationIntensity?: AccessibilityIntensity;
};

export type AccessibilityInputSettings = {
  keyboardNavigation?: AccessibilityPreferenceMode;
  visibleKeyboardShortcuts?: AccessibilityPreferenceMode;
  stickyKeys?: AccessibilityPreferenceMode;
  slowKeys?: AccessibilityPreferenceMode;
  bounceKeys?: AccessibilityPreferenceMode;
  mouseKeys?: AccessibilityPreferenceMode;
  hoverIntentDelayMs?: number;
  doubleClickDelayMs?: number;
  requireConfirmBeforeDestructiveActions?: AccessibilityPreferenceMode;
};

export type AccessibilityMediaSettings = {
  captions?: AccessibilityPreferenceMode;
  captionsSize?: AccessibilityCaptionsSize;
  captionsStyle?: AccessibilityCaptionsStyle;
  transcripts?: AccessibilityPreferenceMode;
  audioDescriptions?: AccessibilityPreferenceMode;
  monoAudio?: AccessibilityPreferenceMode;
  reduceBackgroundAudio?: AccessibilityPreferenceMode;
};

export type AccessibilityReadingSettings = {
  readingGuide?: AccessibilityReadingGuideMode;
  highlightCurrentLine?: AccessibilityPreferenceMode;
  highlightCurrentParagraph?: AccessibilityPreferenceMode;
  simplifyLanguage?: AccessibilityPreferenceMode;
  reduceVisualClutter?: AccessibilityPreferenceMode;
  persistentTooltips?: AccessibilityPreferenceMode;
  glossaryHints?: AccessibilityPreferenceMode;
};

export type AccessibilityAssistiveTechnologySettings = {
  screenReaderOptimized?: AccessibilityPreferenceMode;
  screenReaderVerbosity?: AccessibilityScreenReaderVerbosity;
  announceRouteChanges?: AccessibilityPreferenceMode;
  announceLiveUpdates?: AccessibilityPreferenceMode;
  ariaDescriptions?: AccessibilityPreferenceMode;
};

export type AccessibilityUserSettings = {
  visual?: AccessibilityVisualSettings;
  motion?: AccessibilityMotionSettings;
  input?: AccessibilityInputSettings;
  media?: AccessibilityMediaSettings;
  reading?: AccessibilityReadingSettings;
  assistiveTechnology?: AccessibilityAssistiveTechnologySettings;
};

export type AccessibilityUserSettingsPatch = {
  visual?: Partial<AccessibilityVisualSettings>;
  motion?: Partial<AccessibilityMotionSettings>;
  input?: Partial<AccessibilityInputSettings>;
  media?: Partial<AccessibilityMediaSettings>;
  reading?: Partial<AccessibilityReadingSettings>;
  assistiveTechnology?: Partial<AccessibilityAssistiveTechnologySettings>;
};
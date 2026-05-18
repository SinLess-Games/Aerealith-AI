// libs/db/src/types/user-settings/appearance.type.ts

export type AppearancePreferenceMode = 'system' | 'enabled' | 'disabled';

export type AppearanceTheme =
  | 'system'
  | 'light'
  | 'dark'
  | 'dim'
  | 'oled'
  | 'high_contrast_light'
  | 'high_contrast_dark'
  | 'custom';

export type AppearanceColorScheme =
  | 'system'
  | 'light'
  | 'dark'
  | 'light_dark'
  | 'only_light'
  | 'only_dark'
  | 'custom';

export type AppearanceAccentColor =
  | 'default'
  | 'slate'
  | 'gray'
  | 'zinc'
  | 'neutral'
  | 'stone'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose'
  | 'brand'
  | 'custom';

export type AppearanceDensity =
  | 'compact'
  | 'comfortable'
  | 'spacious'
  | 'custom';

export type AppearanceRadius =
  | 'none'
  | 'small'
  | 'medium'
  | 'large'
  | 'extra_large'
  | 'pill'
  | 'custom';

export type AppearanceFontFamily =
  | 'system'
  | 'sans'
  | 'serif'
  | 'mono'
  | 'rounded'
  | 'dyslexia_friendly'
  | 'custom';

export type AppearanceSidebarMode =
  | 'expanded'
  | 'collapsed'
  | 'icons_only'
  | 'hidden'
  | 'auto';

export type AppearanceNavigationMode =
  | 'top'
  | 'side'
  | 'bottom'
  | 'command_palette'
  | 'auto';

export type AppearanceDashboardLayout =
  | 'default'
  | 'compact'
  | 'comfortable'
  | 'dense'
  | 'cards'
  | 'table'
  | 'grid'
  | 'custom';

export type AppearanceChartStyle =
  | 'default'
  | 'minimal'
  | 'detailed'
  | 'high_contrast'
  | 'monochrome'
  | 'brand'
  | 'custom';

export type AppearanceCodeTheme =
  | 'system'
  | 'light'
  | 'dark'
  | 'github_light'
  | 'github_dark'
  | 'vscode_light'
  | 'vscode_dark'
  | 'dracula'
  | 'nord'
  | 'monokai'
  | 'solarized_light'
  | 'solarized_dark'
  | 'custom';

export type AppearanceThemeSettings = {
  theme?: AppearanceTheme;
  colorScheme?: AppearanceColorScheme;
  accentColor?: AppearanceAccentColor;
  customAccentColor?: string;
  customBackgroundColor?: string;
  customForegroundColor?: string;
  customMutedColor?: string;
  customBorderColor?: string;
  followSystemTheme?: boolean;
  syncThemeAcrossDevices?: boolean;
};

export type AppearanceLayoutSettings = {
  density?: AppearanceDensity;
  radius?: AppearanceRadius;
  sidebarMode?: AppearanceSidebarMode;
  navigationMode?: AppearanceNavigationMode;
  dashboardLayout?: AppearanceDashboardLayout;
  showBreadcrumbs?: boolean;
  showPageHeaders?: boolean;
  showFooter?: boolean;
  stickyHeader?: boolean;
  stickySidebar?: boolean;
  compactTables?: boolean;
  compactForms?: boolean;
};

export type AppearanceTypographySettings = {
  fontFamily?: AppearanceFontFamily;
  customFontFamily?: string;
  baseFontSizePx?: number;
  headingFontFamily?: AppearanceFontFamily;
  customHeadingFontFamily?: string;
  codeFontFamily?: AppearanceFontFamily;
  customCodeFontFamily?: string;
};

export type AppearanceVisualEffectsSettings = {
  shadows?: AppearancePreferenceMode;
  gradients?: AppearancePreferenceMode;
  glassmorphism?: AppearancePreferenceMode;
  backgroundPattern?: AppearancePreferenceMode;
  animatedBackground?: AppearancePreferenceMode;
  blurEffects?: AppearancePreferenceMode;
  reduceChrome?: boolean;
};

export type AppearanceDataDisplaySettings = {
  chartStyle?: AppearanceChartStyle;
  codeTheme?: AppearanceCodeTheme;
  showGridLines?: boolean;
  showTableBorders?: boolean;
  zebraStripedTables?: boolean;
  wrapTableText?: boolean;
  truncateLongText?: boolean;
  showRelativeTime?: boolean;
  showAvatars?: boolean;
  showStatusBadges?: boolean;
};

export type AppearanceUserSettings = {
  mode?: AppearancePreferenceMode;
  theme?: AppearanceThemeSettings;
  layout?: AppearanceLayoutSettings;
  typography?: AppearanceTypographySettings;
  visualEffects?: AppearanceVisualEffectsSettings;
  dataDisplay?: AppearanceDataDisplaySettings;
};

export type AppearanceUserSettingsPatch = {
  mode?: AppearancePreferenceMode;
  theme?: Partial<AppearanceThemeSettings>;
  layout?: Partial<AppearanceLayoutSettings>;
  typography?: Partial<AppearanceTypographySettings>;
  visualEffects?: Partial<AppearanceVisualEffectsSettings>;
  dataDisplay?: Partial<AppearanceDataDisplaySettings>;
};
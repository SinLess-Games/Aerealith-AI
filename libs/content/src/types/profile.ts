export type ProfileConnectionCategoryIcon =
  | 'folder'
  | 'integrations'
  | 'code'
  | 'connections'
  | 'streaming'
  | 'analytics';

export interface ProfileConnectionCategory {
  label: string;
  icon: ProfileConnectionCategoryIcon;
}

export interface ProfileSelectOption {
  label: string;
  value: string;
}

export interface ProfileEditOptions {
  contentMaturity: readonly ProfileSelectOption[];
  countries: readonly ProfileSelectOption[];
  dateFormats: readonly ProfileSelectOption[];
  genders: readonly ProfileSelectOption[];
  languageProficiencies: readonly ProfileSelectOption[];
  languages: readonly ProfileSelectOption[];
  measurementSystems: readonly ProfileSelectOption[];
  nameDisplayOrders: readonly ProfileSelectOption[];
  profileFieldVisibilities: readonly ProfileSelectOption[];
  profileLinkPlatforms: readonly ProfileSelectOption[];
  profileStatuses: readonly ProfileSelectOption[];
  profileVisibilities: readonly ProfileSelectOption[];
  sexes: readonly ProfileSelectOption[];
  sexualities: readonly ProfileSelectOption[];
  timeFormats: readonly ProfileSelectOption[];
  timezoneGreenwich: readonly ProfileSelectOption[];
  timezoneUtc: readonly ProfileSelectOption[];
  weekStartDays: readonly ProfileSelectOption[];
}

export type ProfileTabValue =
  | 'overview'
  | 'profile'
  | 'recent-activity'
  | 'projects'
  | 'models'
  | 'connections'
  | 'integrations'
  | 'achievements'
  | 'settings';

export interface ProfileTabItem {
  label: string;
  value: ProfileTabValue;
  href: string;
  publicHidden?: boolean;
  privateOnly?: boolean;
}

export type ProfileSidebarIcon =
  | 'overview'
  | 'dashboard'
  | 'projects'
  | 'models'
  | 'connections'
  | 'integrations'
  | 'settings';

export interface ProfileSidebarItem {
  label: string;
  href: string;
  icon: ProfileSidebarIcon;
  privateOnly?: boolean;
  publicHidden?: boolean;
}

export interface ProfileScaffoldContent {
  tabs: readonly ProfileTabItem[];
  sidebar: readonly ProfileSidebarItem[];
  connectionCategories: readonly ProfileConnectionCategory[];
}

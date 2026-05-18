export type ProfileIconName =
  | 'achievement'
  | 'activity'
  | 'analytics'
  | 'arrow'
  | 'calendar'
  | 'code'
  | 'connections'
  | 'dashboard'
  | 'filter'
  | 'folder'
  | 'followers'
  | 'home'
  | 'integrations'
  | 'link'
  | 'location'
  | 'logout'
  | 'models'
  | 'overview'
  | 'projects'
  | 'search'
  | 'settings'
  | 'streaming';

export type ProfileViewMode = 'private' | 'public';

export type ProfileSidebarItem = {
  label: string;
  href: string;
  icon: ProfileIconName;
  privateOnly?: boolean;
};

export type ProfileTabItem = {
  label: string;
  value: string;
  href: string;
  privateOnly?: boolean;
  publicHidden?: boolean;
};

export type ProfileConnectionCategory = {
  label: string;
  icon: ProfileIconName;
  privateOnly?: boolean;
};

export type ProfileIdentityScaffold = {
  username?: string;
  handle?: string;
  initials?: string;
  bio?: string;
  location?: string;
  website?: string;
  joined?: string;
};

export type ProfileTopbarAction = {
  label: string;
  href: string;
  icon?: ProfileIconName;
};

export type ProfileMetricScaffold = {
  label: string;
  value?: string;
  helperText?: string;
  icon: ProfileIconName;
};

export type ProfileSummaryItem = {
  title: string;
  value?: string;
  body?: string;
  icon: ProfileIconName;
};

export type ProfileActivityItem = {
  title: string;
  meta?: string;
  detail?: string;
};

export type ProfileProjectItem = {
  name: string;
  status?: string;
  body?: string;
};

export type ProfileModelItem = {
  name: string;
  type?: string;
  score?: string;
};

export type ProfileConnectionItem = {
  name: string;
  category?: string;
  status?: string;
  connectedAt?: string;
};

export type ProfileIntegrationItem = {
  name: string;
  category?: string;
  status?: string;
};

export type ProfileAchievementItem = {
  name: string;
  detail?: string;
};

export type ProfileScaffoldContent = {
  sidebar: ProfileSidebarItem[];
  tabs: ProfileTabItem[];
  connectionCategories: ProfileConnectionCategory[];
};

export type ProfileSelectOption = {
  label: string;
  value: string;
};

export type ProfileEditOptions = {
  contentMaturity: ProfileSelectOption[];
  countries: ProfileSelectOption[];
  dateFormats: ProfileSelectOption[];
  genders: ProfileSelectOption[];
  languageProficiencies: ProfileSelectOption[];
  languages: ProfileSelectOption[];
  measurementSystems: ProfileSelectOption[];
  nameDisplayOrders: ProfileSelectOption[];
  profileFieldVisibilities: ProfileSelectOption[];
  profileLinkPlatforms: ProfileSelectOption[];
  profileStatuses: ProfileSelectOption[];
  profileVisibilities: ProfileSelectOption[];
  sexes: ProfileSelectOption[];
  sexualities: ProfileSelectOption[];
  timeFormats: ProfileSelectOption[];
  timezoneGreenwich: ProfileSelectOption[];
  timezoneUtc: ProfileSelectOption[];
  weekStartDays: ProfileSelectOption[];
};

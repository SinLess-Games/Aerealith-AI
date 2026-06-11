// libs/content/src/en/index.ts

export * from './about';
export * from './constants';
export * from './contact';
export * from './footer';
export * from './header';
export * from './home';
export * from './policies';
export * from './technology';

// Browser-safe profile content only.
// Do not export profile-edit-options here because it imports libs/db.
export { profileScaffoldContent } from './profile';
export { profileConnectionCategories } from './profile/connection-categories';
export { profileTabs } from './profile/profile-tabs';
export { profileSidebar } from './profile/sidebar';

export type {
  PolicyDocument, ProfileConnectionCategory,
  ProfileConnectionCategoryIcon,
  ProfileEditOptions,
  ProfileScaffoldContent,
  ProfileSelectOption,
  ProfileSidebarIcon,
  ProfileSidebarItem,
  ProfileTabItem,
  ProfileTabValue
} from '../types';

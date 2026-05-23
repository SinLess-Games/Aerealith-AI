// libs/content/src/en/profile/index.ts

import type { ProfileScaffoldContent } from '../../types/profile';

import { profileConnectionCategories } from './connection-categories';
import { profileTabs } from './profile-tabs';
import { profileSidebar } from './sidebar';

export { profileConnectionCategories } from './connection-categories';
export { profileTabs } from './profile-tabs';
export { profileSidebar } from './sidebar';

export const profileScaffoldContent = {
  tabs: profileTabs,
  sidebar: profileSidebar,
  connectionCategories: profileConnectionCategories,
} as const satisfies ProfileScaffoldContent;

export default profileScaffoldContent;
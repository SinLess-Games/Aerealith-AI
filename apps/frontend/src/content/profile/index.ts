import type { ProfileScaffoldContent } from '@helix-ai/ui';

import { profileConnectionCategories } from './connection-categories';
import { profileTabs } from './profile-tabs';
import { profileSidebar } from './sidebar';

export { profileConnectionCategories } from './connection-categories';
export { profileEditOptions } from './profile-edit-options';
export { profileTabs } from './profile-tabs';
export { profileSidebar } from './sidebar';

export const profileScaffoldContent: ProfileScaffoldContent = {
  sidebar: profileSidebar,
  tabs: profileTabs,
  connectionCategories: profileConnectionCategories,
};

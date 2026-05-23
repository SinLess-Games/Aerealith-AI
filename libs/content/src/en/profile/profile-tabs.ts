import type { ProfileTabItem } from '../../types';

export const profileTabs = [
  {
    label: 'Overview',
    value: 'overview',
    href: '#overview',
    publicHidden: true,
  },
  {
    label: 'Profile',
    value: 'profile',
    href: '#profile',
  },
  {
    label: 'Recent Activity',
    value: 'recent-activity',
    href: '#recent-activity',
  },
  {
    label: 'Projects',
    value: 'projects',
    href: '#projects',
  },
  {
    label: 'Models',
    value: 'models',
    href: '#models',
    publicHidden: true,
  },
  {
    label: 'Connections',
    value: 'connections',
    href: '#connections',
    privateOnly: true,
  },
  {
    label: 'Integrations',
    value: 'integrations',
    href: '#integrations',
    publicHidden: true,
  },
  {
    label: 'Achievements',
    value: 'achievements',
    href: '#achievements',
  },
  {
    label: 'Settings',
    value: 'settings',
    href: '#settings',
    privateOnly: true,
  },
] as const satisfies readonly ProfileTabItem[];

/**
 * Backwards-compatible uppercase export.
 *
 * Prefer `profileTabs` for new imports.
 */
export const PROFILE_TABS = profileTabs;
import type { ProfileSidebarItem } from '../../types';

export const profileSidebar = [
  {
    label: 'Overview',
    href: '#overview',
    icon: 'overview',
  },
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: 'dashboard',
    privateOnly: true,
  },
  {
    label: 'Projects',
    href: '#projects',
    icon: 'projects',
  },
  {
    label: 'Models',
    href: '#models',
    icon: 'models',
  },
  {
    label: 'Connections',
    href: '#connections',
    icon: 'connections',
    privateOnly: true,
  },
  {
    label: 'Integrations',
    href: '#integrations',
    icon: 'integrations',
  },
  {
    label: 'Settings',
    href: '#settings',
    icon: 'settings',
    privateOnly: true,
  },
] as const satisfies readonly ProfileSidebarItem[];

/**
 * Backwards-compatible uppercase export.
 *
 * Prefer `profileSidebar` for new imports.
 */
export const PROFILE_SIDEBAR = profileSidebar;
import type { ProfileSidebarItem } from '@helix-ai/ui';

export const profileSidebar: ProfileSidebarItem[] = [
  { label: 'Overview', href: '#overview', icon: 'overview' },
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', privateOnly: true },
  { label: 'Projects', href: '#projects', icon: 'projects' },
  { label: 'Models', href: '#models', icon: 'models' },
  { label: 'Connections', href: '#connections', icon: 'connections', privateOnly: true },
  { label: 'Integrations', href: '#integrations', icon: 'integrations' },
  { label: 'Settings', href: '#settings', icon: 'settings', privateOnly: true },
];

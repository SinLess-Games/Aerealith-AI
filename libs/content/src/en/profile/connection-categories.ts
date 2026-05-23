import type { ProfileConnectionCategory } from '../../types';

export const profileConnectionCategories = [
  {
    label: 'All Connections',
    icon: 'folder',
  },
  {
    label: 'Cloud Storage',
    icon: 'integrations',
  },
  {
    label: 'Code & Dev',
    icon: 'code',
  },
  {
    label: 'Communication',
    icon: 'connections',
  },
  {
    label: 'Streaming',
    icon: 'streaming',
  },
  {
    label: 'Analytics',
    icon: 'analytics',
  },
] as const satisfies readonly ProfileConnectionCategory[];

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `profileConnectionCategories` for new imports.
 */
export const PROFILE_CONNECTION_CATEGORIES = profileConnectionCategories;
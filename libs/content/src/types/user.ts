// libs/content/src/types/user.ts

export type UserProfileMenuUserStatus =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'suspended'
  | 'deleted';

export type UserProfileMenuUser = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  username?: string | null;
  handle?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  imageUrl?: string | null;
  initials?: string | null;
  role?: string | null;
  plan?: string | null;
  status?: UserProfileMenuUserStatus | null;
};

export type UserProfileMenuActionKind =
  | 'profile'
  | 'settings'
  | 'billing'
  | 'dashboard'
  | 'admin'
  | 'support'
  | 'separator'
  | 'sign-out'
  | 'custom';

export type UserProfileMenuActionVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'destructive';

export type UserProfileMenuAction = {
  id: string;
  label: string;
  kind?: UserProfileMenuActionKind;
  variant?: UserProfileMenuActionVariant;
  href?: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
  external?: boolean;
  requiresAuth?: boolean;
};

import type { UserProfileMenuUser } from '../components/profile/user-profile-menu';

export type ActivePathOptions = {
  exact?: boolean;
  includeChildren?: boolean;
};

export type HeaderUserResolutionOptions = {
  persist?: boolean;
  fallbackToPersistedUsername?: boolean;
  createFallbackUser?: boolean;
};

export type HeaderUserResolution = {
  user: UserProfileMenuUser | null;
  username: string | null;
  authenticated: boolean;
};

import type { CSSProperties } from 'react';

import type { SxProps, Theme } from '@mui/material/styles';
import type { StaticImageData } from 'next/image';

import type {
  UserProfileMenuAction,
  UserProfileMenuUser,
} from '../components/profile/user-profile-menu';
import type { LoginSignupSuccessPayload } from '../components/layout/login-signup';

export type ActivePathOptions = {
  exact?: boolean;
  includeChildren?: boolean;
};

export type HeaderUserResolutionOptions = {
  persist?: boolean;
  fallbackToPersistedUsername?: boolean;
  createFallbackUser?: boolean;
};

export type HeaderUserResolution = {
  user: UserProfileMenuUser | null;
  username: string | null;
  authenticated: boolean;
};

export interface Page {
  name: string;
  url: string;
}

export interface HeaderProps {
  logo: string | StaticImageData;
  version: string;
  pages: readonly Page[];

  style?: CSSProperties;
  sx?: SxProps<Theme>;
  logoAlt?: string;

  githubReleasesUrl?: string;
  latestReleaseApiUrl?: string;

  user?: UserProfileMenuUser | null;
  authLoading?: boolean;

  loginEndpoint?: string;
  signupEndpoint?: string;
  logoutEndpoint?: string;

  /**
   * User profile lookup endpoint.
   *
   * Supported formats:
   * - /api/V1/users/{username}
   * - /api/V1/users/:username
   * - /api/V1/users
   */
  userProfileEndpoint?: string;

  dashboardHref?: string;
  profileHref?: string;
  settingsHref?: string;
  userMenuActions?: readonly UserProfileMenuAction[];

  onAuthSuccess?: (payload: LoginSignupSuccessPayload) => void;
  onLogout?: () => void | Promise<void>;
  onLogoutSuccess?: (response: unknown) => void;
  onLogoutError?: (error: unknown) => void;
}

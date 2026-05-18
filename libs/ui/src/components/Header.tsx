'use client';

import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme, type SxProps, type Theme } from '@mui/material/styles';
import Image, { type StaticImageData } from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import styles from './Header.module.scss';
import LoginSignup from './login-signup';
import type { LoginSignupSuccessPayload } from './login-signup';
import UserProfileMenu from './user-profile-menu';
import type {
  UserProfileMenuAction,
  UserProfileMenuUser,
} from './user-profile-menu';

export interface Page {
  name: string;
  url: string;
}

export interface HeaderProps {
  logo: string | StaticImageData;
  version: string;
  pages: Page[];
  style?: React.CSSProperties;
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
  userMenuActions?: UserProfileMenuAction[];

  onAuthSuccess?: (payload: LoginSignupSuccessPayload) => void;
  onLogout?: () => void | Promise<void>;
  onLogoutSuccess?: (response: unknown) => void;
  onLogoutError?: (error: unknown) => void;
}

type UnknownRecord = Record<string, unknown>;

const CURRENT_USERNAME_STORAGE_KEY = 'helix.currentUsername';
const USERNAME_COOKIE_NAME = 'helix_username';
const PERSISTED_USERNAME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function isActivePath(pathname: string | null, url: string): boolean {
  if (!pathname) {
    return false;
  }

  if (url === '/') {
    return pathname === '/';
  }

  return pathname === url || pathname.startsWith(`${url}/`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(
  record: UnknownRecord,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = safeDecodeURIComponent(
      cookie.slice(0, separatorIndex).trim(),
    );

    if (cookieName !== name) {
      continue;
    }

    const cookieValue = cookie.slice(separatorIndex + 1);

    return safeDecodeURIComponent(cookieValue).trim() || null;
  }

  return null;
}

function writeBrowserCookie(name: string, value: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${PERSISTED_USERNAME_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ].join('; ');
}

function deleteBrowserCookie(name: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = [
    `${encodeURIComponent(name)}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'SameSite=Lax',
  ].join('; ');
}

function readLocalStorageUsername(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(CURRENT_USERNAME_STORAGE_KEY);

    return value?.trim() || null;
  } catch {
    return null;
  }
}

function readPersistedUsername(): string | null {
  return readBrowserCookie(USERNAME_COOKIE_NAME) ?? readLocalStorageUsername();
}

function persistUsername(username: string): void {
  const normalizedUsername = username.trim();

  if (!normalizedUsername || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      CURRENT_USERNAME_STORAGE_KEY,
      normalizedUsername,
    );
  } catch {
    // Ignore storage failures. The cookie is still enough for hydration.
  }

  writeBrowserCookie(USERNAME_COOKIE_NAME, normalizedUsername);
}

function clearPersistedUsername(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(CURRENT_USERNAME_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }

  deleteBrowserCookie(USERNAME_COOKIE_NAME);
}

function normalizeUserRecord(
  record: UnknownRecord,
): UserProfileMenuUser | null {
  const id = readString(record, ['id', 'userId', 'user_id', 'sub']);
  const username = readString(record, ['username', 'handle']);
  const name = readString(record, ['name', 'fullName', 'full_name']);
  const displayName = readString(record, ['displayName', 'display_name']);
  const email = readString(record, ['email', 'emailAddress', 'email_address']);
  const avatarUrl = readString(record, [
    'avatarUrl',
    'avatar_url',
    'avatar',
    'image',
    'picture',
  ]);

  if (!id && !username && !name && !displayName && !email) {
    return null;
  }

  const resolvedDisplayName =
    displayName ?? name ?? username ?? email ?? 'Account';

  return {
    ...record,
    id: id ?? username ?? email ?? resolvedDisplayName,
    name: name ?? resolvedDisplayName,
    displayName: resolvedDisplayName,
    username,
    email,
    avatarUrl,
    avatar: avatarUrl,
    image: avatarUrl,
    picture: avatarUrl,
  } as unknown as UserProfileMenuUser;
}

function extractUserFromUnknown(
  value: unknown,
  depth = 0,
): UserProfileMenuUser | null {
  if (!isRecord(value) || depth > 6) {
    return null;
  }

  const directUser = normalizeUserRecord(value);

  if (directUser) {
    return directUser;
  }

  const nestedKeys = [
    'user',
    'currentUser',
    'profile',
    'account',
    'member',
    'principal',
    'identity',
    'session',
    'auth',
    'data',
    'payload',
    'result',
  ];

  for (const key of nestedKeys) {
    const nestedUser = extractUserFromUnknown(value[key], depth + 1);

    if (nestedUser) {
      return nestedUser;
    }
  }

  return null;
}

function extractUsernameFromUnknown(
  value: unknown,
  depth = 0,
): string | null {
  if (!isRecord(value) || depth > 6) {
    return null;
  }

  const directUsername = readString(value, [
    'username',
    'handle',
    'login',
    'userName',
    'user_name',
  ]);

  if (directUsername) {
    return directUsername;
  }

  const nestedKeys = [
    'user',
    'currentUser',
    'profile',
    'account',
    'member',
    'principal',
    'identity',
    'session',
    'auth',
    'data',
    'payload',
    'result',
  ];

  for (const key of nestedKeys) {
    const nestedUsername = extractUsernameFromUnknown(value[key], depth + 1);

    if (nestedUsername) {
      return nestedUsername;
    }
  }

  return null;
}

function resolveUsername(user: UserProfileMenuUser | null): string | null {
  if (!user || !isRecord(user)) {
    return null;
  }

  return (
    readString(user, [
      'username',
      'handle',
      'login',
      'userName',
      'user_name',
    ]) ?? null
  );
}

function createAuthenticatedFallbackUser(
  username?: string | null,
): UserProfileMenuUser {
  const resolvedUsername = username?.trim() || undefined;
  const displayName = resolvedUsername ?? 'Account';

  return {
    id: resolvedUsername ?? 'authenticated-user',
    name: displayName,
    displayName,
    username: resolvedUsername,
    email: undefined,
    avatarUrl: undefined,
    avatar: undefined,
    image: undefined,
    picture: undefined,
  } as unknown as UserProfileMenuUser;
}

function buildUserProfileUrl(endpoint: string, username: string): string {
  const safeUsername = encodeURIComponent(username);

  if (endpoint.includes('{username}')) {
    return endpoint.replaceAll('{username}', safeUsername);
  }

  if (endpoint.includes(':username')) {
    return endpoint.replaceAll(':username', safeUsername);
  }

  return `${endpoint.replace(/\/+$/, '')}/${safeUsername}`;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.toLowerCase().includes('application/json')) {
    return response.json();
  }

  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function Header({
  logo,
  version,
  pages,
  style,
  sx,
  logoAlt = 'Helix logo',
  githubReleasesUrl = 'https://github.com/SinLess-Games/Helix/releases',
  latestReleaseApiUrl = 'https://api.github.com/repos/SinLess-Games/Helix/releases/latest',

  user: userProp,
  authLoading = false,

  loginEndpoint = '/api/V1/auth/login',
  signupEndpoint = '/api/V1/auth/signup',
  logoutEndpoint = '/api/V1/auth/logout',
  userProfileEndpoint = '/api/V1/users/{username}',

  dashboardHref = '/dashboard',
  profileHref = '/profile',
  settingsHref = '/settings',
  userMenuActions,

  onAuthSuccess,
  onLogout,
  onLogoutSuccess,
  onLogoutError,
}: HeaderProps) {
  const [mounted, setMounted] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [latestVersion, setLatestVersion] = React.useState<string | null>(null);
  const [scrolled, setScrolled] = React.useState(false);
  const [currentUser, setCurrentUser] =
    React.useState<UserProfileMenuUser | null>(() => userProp ?? null);
  const [internalAuthLoading, setInternalAuthLoading] = React.useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();

  const effectiveAuthLoading = authLoading || internalAuthLoading;

  const fetchUserProfile = React.useCallback(
    async (
      username: string | null | undefined,
      fallbackUser: UserProfileMenuUser | null = null,
    ): Promise<UserProfileMenuUser | null> => {
      const normalizedUsername = username?.trim();

      if (!normalizedUsername) {
        return fallbackUser;
      }

      try {
        const response = await fetch(
          buildUserProfileUrl(userProfileEndpoint, normalizedUsername),
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
            },
            cache: 'no-store',
          },
        );

        if (response.status === 401 || response.status === 403) {
          return fallbackUser ?? createAuthenticatedFallbackUser(normalizedUsername);
        }

        if (!response.ok) {
          throw new Error(`Failed to load user profile: ${response.status}`);
        }

        const body = await readResponseBody(response);
        const user =
          extractUserFromUnknown(body) ??
          fallbackUser ??
          createAuthenticatedFallbackUser(normalizedUsername);

        const resolvedUsername = resolveUsername(user) ?? normalizedUsername;

        persistUsername(resolvedUsername);

        return user;
      } catch {
        return fallbackUser ?? createAuthenticatedFallbackUser(normalizedUsername);
      }
    },
    [userProfileEndpoint],
  );

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (typeof userProp !== 'undefined') {
      setCurrentUser(userProp);
    }
  }, [userProp]);

  React.useEffect(() => {
    let cancelled = false;

    const persistedUsername = readPersistedUsername();

    if (userProp) {
      setCurrentUser(userProp);
      const propUsername = resolveUsername(userProp);

      if (propUsername) {
        persistUsername(propUsername);
      }

      return () => {
        cancelled = true;
      };
    }

    if (!persistedUsername) {
      setCurrentUser(null);

      return () => {
        cancelled = true;
      };
    }

    const fallbackUser = createAuthenticatedFallbackUser(persistedUsername);

    setCurrentUser(fallbackUser);
    setInternalAuthLoading(true);

    void fetchUserProfile(persistedUsername, fallbackUser)
      .then((nextUser) => {
        if (!cancelled) {
          setCurrentUser(nextUser ?? fallbackUser);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInternalAuthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchUserProfile, pathname, userProp]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadLatestVersion(): Promise<void> {
      try {
        const response = await fetch(latestReleaseApiUrl, {
          headers: {
            Accept: 'application/vnd.github+json',
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`GitHub releases request failed: ${response.status}`);
        }

        const data = (await response.json()) as { tag_name?: string };
        const tagName = typeof data.tag_name === 'string' ? data.tag_name : '';
        const normalizedVersion = normalizeVersion(tagName);

        if (!cancelled) {
          setLatestVersion(normalizedVersion || null);
        }
      } catch {
        if (!cancelled) {
          setLatestVersion(null);
        }
      }
    }

    void loadLatestVersion();

    return () => {
      cancelled = true;
    };
  }, [latestReleaseApiUrl]);

  React.useEffect(() => {
    const handleScroll = (): void => {
      setScrolled(window.scrollY > 8);
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(
      theme.breakpoints.up('md').replace('@media ', ''),
    );

    const closeMenuOnDesktop = (
      event: MediaQueryListEvent | MediaQueryList,
    ): void => {
      if (event.matches) {
        setMenuOpen(false);
      }
    };

    closeMenuOnDesktop(mediaQuery);

    mediaQuery.addEventListener('change', closeMenuOnDesktop);

    return () => {
      mediaQuery.removeEventListener('change', closeMenuOnDesktop);
    };
  }, [theme]);

  const activePathname = mounted ? pathname : null;
  const displayVersion = latestVersion ?? normalizeVersion(version);
  const releaseUrl = `${githubReleasesUrl}/tag/v${displayVersion}`;

  const navigate = React.useCallback(
    (href: string): void => {
      router.push(href);
    },
    [router],
  );

  const navigateAndClose = React.useCallback(
    (href: string): void => {
      setMenuOpen(false);
      router.push(href);
    },
    [router],
  );

  const handleAuthNavigate = React.useCallback(
    (href: string): void => {
      setMenuOpen(false);
      router.push(href);
    },
    [router],
  );

  const handleAuthSuccess = React.useCallback(
    (payload: LoginSignupSuccessPayload): void => {
      setMenuOpen(false);

      const payloadUser = extractUserFromUnknown(payload);
      const payloadUsername =
        extractUsernameFromUnknown(payload) ??
        resolveUsername(payloadUser) ??
        readPersistedUsername();

      if (payloadUsername) {
        persistUsername(payloadUsername);
      }

      const immediateUser =
        payloadUser ?? createAuthenticatedFallbackUser(payloadUsername);

      setCurrentUser(immediateUser);

      if (payloadUsername) {
        setInternalAuthLoading(true);

        void fetchUserProfile(payloadUsername, immediateUser)
          .then((nextUser) => {
            setCurrentUser(nextUser ?? immediateUser);
          })
          .finally(() => {
            setInternalAuthLoading(false);
          });
      }

      onAuthSuccess?.(payload);
      router.refresh();
    },
    [fetchUserProfile, onAuthSuccess, router],
  );

  const handleLogout = React.useCallback(async (): Promise<void> => {
    await onLogout?.();
  }, [onLogout]);

  const handleLogoutSuccess = React.useCallback(
    (response: unknown): void => {
      clearPersistedUsername();
      setCurrentUser(null);
      onLogoutSuccess?.(response);
      router.refresh();
    },
    [onLogoutSuccess, router],
  );

  const handleLogoutError = React.useCallback(
    (error: unknown): void => {
      onLogoutError?.(error);
    },
    [onLogoutError],
  );

  const headerClassName = scrolled
    ? `${styles.header} ${styles.scrolled}`
    : styles.header;

  const authButtonsSx: SxProps<Theme> = {
    width: 'auto',
    maxWidth: 'none',
    mx: 0,
    p: 0,
    border: 0,
    borderRadius: 0,
    borderColor: 'transparent',
    bgcolor: 'transparent',
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    boxShadow: 'none',
    backdropFilter: 'none',

    '&:hover': {
      bgcolor: 'transparent',
      backgroundColor: 'transparent',
      boxShadow: 'none',
    },

    '& > .MuiStack-root': {
      gap: 0,
      alignItems: 'flex-end',
    },

    '& > .MuiStack-root > .MuiStack-root:first-of-type': {
      display: 'none',
    },

    '& > .MuiStack-root > .MuiDivider-root': {
      display: 'none',
    },

    '& > .MuiStack-root > .MuiStack-root:last-of-type': {
      width: 'auto',
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 1,
    },

    '& > .MuiStack-root > .MuiStack-root:last-of-type > .MuiButton-root': {
      minWidth: { md: 84, lg: 96 },
      px: { md: 1.5, lg: 2 },
      py: 0.65,
      borderRadius: 999,
      fontWeight: 800,
      lineHeight: 1.2,
      letterSpacing: '0.04em',
      textTransform: 'none',
      whiteSpace: 'nowrap',
    },
  };

  const mobileAuthButtonsSx: SxProps<Theme> = {
    width: '100%',
    maxWidth: 'none',
    mx: 0,
    p: 0,
    border: 0,
    borderRadius: 0,
    bgcolor: 'transparent',
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    boxShadow: 'none',
    backdropFilter: 'none',

    '& > .MuiStack-root > .MuiStack-root:first-of-type': {
      display: 'none',
    },

    '& > .MuiStack-root > .MuiDivider-root': {
      display: 'none',
    },

    '& > .MuiStack-root > .MuiStack-root:last-of-type': {
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
    },

    '& > .MuiStack-root > .MuiStack-root:last-of-type > .MuiButton-root': {
      width: '100%',
      borderRadius: 999,
      fontWeight: 800,
      letterSpacing: '0.04em',
      textTransform: 'none',
    },
  };

  const renderAuthControl = (
    placement: 'desktop' | 'mobile',
  ): React.ReactElement => {
    const isMobile = placement === 'mobile';

    if (effectiveAuthLoading && !currentUser) {
      return (
        <Box
          sx={{
            width: isMobile ? '100%' : 'auto',
            minHeight: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isMobile ? 'center' : 'flex-end',
          }}
        >
          <CircularProgress
            size={22}
            thickness={5}
            sx={{
              color: '#8be9ff',
              filter: 'drop-shadow(0 0 6px rgba(139, 233, 255, 0.5))',
            }}
          />
        </Box>
      );
    }

    if (currentUser) {
      return (
        <UserProfileMenu
          user={currentUser}
          logoutEndpoint={logoutEndpoint}
          dashboardHref={dashboardHref}
          profileHref={profileHref}
          settingsHref={settingsHref}
          actions={userMenuActions}
          onNavigate={handleAuthNavigate}
          onLogout={handleLogout}
          onLogoutSuccess={handleLogoutSuccess}
          onLogoutError={handleLogoutError}
          sx={{
            width: isMobile ? '100%' : 'auto',
            justifyContent: isMobile ? 'stretch' : 'flex-end',
          }}
          buttonSx={
            isMobile
              ? {
                  width: '100%',
                  justifyContent: 'flex-start',
                }
              : undefined
          }
        />
      );
    }

    return (
      <LoginSignup
        loginEndpoint={loginEndpoint}
        signupEndpoint={signupEndpoint}
        onSuccess={handleAuthSuccess}
        sx={isMobile ? mobileAuthButtonsSx : authButtonsSx}
      />
    );
  };

  return (
    <>
      <Box
        component="header"
        className={headerClassName}
        style={style}
        sx={sx}
        suppressHydrationWarning
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 'none',
            mx: 0,
            px: { xs: 1.25, sm: 1.5, md: 2, lg: 2.5 },
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr auto',
              md: 'minmax(220px, 1fr) auto minmax(260px, 1fr)',
              lg: 'minmax(260px, 1fr) auto minmax(300px, 1fr)',
            },
            alignItems: 'center',
            columnGap: { xs: 1.5, md: 2.5 },
            minHeight: { xs: 52, sm: 56, md: 58, lg: 60 },
          }}
        >
          <Stack
            direction="row"
            spacing={0}
            className={styles.leftSection}
            sx={{
              justifySelf: 'start',
              alignItems: 'center',
              minWidth: 0,
            }}
          >
            <Box
              component="button"
              type="button"
              aria-label="Go to Helix home"
              onClick={() => navigate('/')}
              sx={{
                p: 0,
                m: 0,
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                width: { xs: 132, sm: 150, md: 176, lg: 190 },
                height: { xs: 42, sm: 46, md: 50, lg: 52 },
                overflow: 'visible',
                transition: 'transform 180ms ease, filter 180ms ease',

                '&:hover': {
                  transform: 'translateY(-1px)',
                  filter: 'brightness(1.12)',
                },

                '&:focus-visible': {
                  outline: '2px solid rgba(246, 6, 111, 0.85)',
                  outlineOffset: 3,
                  borderRadius: 1,
                },
              }}
            >
              <Image
                src={logo}
                alt={logoAlt}
                width={500}
                height={100}
                priority
                sizes="(max-width: 600px) 132px, (max-width: 900px) 176px, 190px"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: 'left center',
                  filter:
                    'drop-shadow(0 0 3px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 8px rgba(246, 6, 111, 0.35))',
                }}
              />
            </Box>

            <MuiLink
              className={styles.versionLink}
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              underline="none"
              suppressHydrationWarning
              sx={{
                alignSelf: 'center',
                whiteSpace: 'nowrap',
                color: '#8be9ff',
                fontWeight: 800,
                fontSize: { xs: '0.78rem', sm: '0.85rem', md: '0.9rem' },
                letterSpacing: '0.03em',
                lineHeight: 1,
                ml: {
                  xs: '-0.85rem',
                  sm: '-1rem',
                  md: '-1.35rem',
                  lg: '-1.55rem',
                },
                px: 0.7,
                py: 0.42,
                borderRadius: 1,
                backgroundColor: 'rgba(2, 35, 113, 0.38)',
                border: '1px solid rgba(139, 233, 255, 0.34)',
                textShadow:
                  '0 0 6px rgba(139, 233, 255, 0.85), 0 0 12px rgba(246, 6, 111, 0.32)',
                boxShadow:
                  '0 0 12px rgba(139, 233, 255, 0.18), inset 0 0 8px rgba(255, 255, 255, 0.08)',

                '&:hover': {
                  color: '#ffffff',
                  backgroundColor: 'rgba(246, 6, 111, 0.32)',
                  borderColor: 'rgba(246, 6, 111, 0.55)',
                  textShadow:
                    '0 0 8px rgba(255, 255, 255, 0.9), 0 0 14px rgba(246, 6, 111, 0.6)',
                },
              }}
            >
              V{displayVersion}
            </MuiLink>
          </Stack>

          <Stack
            component="nav"
            direction="row"
            className={styles.middleSection}
            aria-label="Primary navigation"
            sx={{
              display: { xs: 'none', md: 'flex' },
              justifySelf: 'center',
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
              columnGap: { md: 2.25, lg: 3 },
              rowGap: 0.5,
              minWidth: 0,
              px: 1,
            }}
          >
            {pages.map((page) => {
              const active = isActivePath(activePathname, page.url);

              return (
                <Button
                  key={`${page.name}:${page.url}`}
                  onClick={() => navigate(page.url)}
                  aria-current={active ? 'page' : undefined}
                  suppressHydrationWarning
                  sx={{
                    color: 'inherit',
                    fontWeight: active ? 700 : 500,
                    borderBottom: active
                      ? '2px solid #f6066f'
                      : '2px solid transparent',
                    borderRadius: 0,
                    whiteSpace: 'nowrap',
                    textTransform: 'none',
                    px: 1,
                    py: 0.5,
                    minWidth: 0,

                    '&:hover': {
                      color: '#f6066f',
                      backgroundColor: 'transparent',
                    },
                  }}
                >
                  {page.name}
                </Button>
              );
            })}
          </Stack>

          <Box
            className={styles.navSection}
            sx={{
              justifySelf: 'end',
              width: '100%',
              minWidth: { xs: 'auto', md: 260, lg: 300 },
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box
              sx={{
                display: { xs: 'none', md: 'flex' },
                justifyContent: 'flex-end',
                alignItems: 'center',
                width: '100%',
                minWidth: 0,
              }}
            >
              {renderAuthControl('desktop')}
            </Box>

            <IconButton
              onClick={() => setMenuOpen(true)}
              sx={{
                color: '#fff',
                display: { xs: 'inline-flex', md: 'none' },
              }}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="helix-mobile-navigation"
              suppressHydrationWarning
            >
              <MenuIcon fontSize="medium" />
            </IconButton>
          </Box>
        </Box>
      </Box>

      <Drawer
        anchor="right"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        PaperProps={{
          id: 'helix-mobile-navigation',
          sx: {
            width: 300,
            color: '#fff',
            bgcolor: '#1f1f2a',
            backgroundImage: 'none',
            borderLeft: `1px solid ${alpha(theme.palette.common.white, 0.12)}`,
          },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 2 }}
        >
          <Typography variant="subtitle1" component="h2">
            Menu
          </Typography>

          <IconButton
            onClick={() => setMenuOpen(false)}
            sx={{ color: '#fff' }}
            aria-label="Close menu"
          >
            <CloseIcon />
          </IconButton>
        </Stack>

        <List component="nav" aria-label="Mobile navigation">
          {pages.map((page) => {
            const active = isActivePath(activePathname, page.url);

            return (
              <ListItem key={`${page.name}:${page.url}`} disablePadding>
                <ListItemButton
                  onClick={() => navigateAndClose(page.url)}
                  selected={active}
                  aria-current={active ? 'page' : undefined}
                  suppressHydrationWarning
                  sx={{
                    color: 'inherit',

                    '&.Mui-selected': {
                      bgcolor: alpha(theme.palette.common.white, 0.08),
                    },

                    '&.Mui-selected:hover': {
                      bgcolor: alpha(theme.palette.common.white, 0.12),
                    },
                  }}
                >
                  <ListItemText primary={page.name} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>

        <Box sx={{ px: 2, py: 2, mt: 'auto' }}>
          {renderAuthControl('mobile')}
        </Box>
      </Drawer>

      <Box aria-hidden sx={{ height: { xs: 52, sm: 56, md: 58, lg: 60 } }} />
    </>
  );
}

export default Header;
// libs/ui/src/components/layout/Header.tsx

'use client';

import MenuIcon from '@mui/icons-material/Menu';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import {
  alpha,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import type { HeaderProps } from '../../types/header';
import { mergeSx } from '../../utils';
import {
  buildUserProfileUrl,
  clearPersistedUsername,
  createAuthenticatedFallbackUser,
  extractUserFromUnknown,
  extractUsernameFromUnknown,
  getMobileNavListSx,
  isActivePath,
  normalizeVersion,
  persistUsername,
  readPersistedUsername,
  readResponseBody,
  resolveUsername,
} from './Header.functions';
import LoginSignup from './login-signup';
import type { LoginSignupSuccessPayload } from './login-signup';
import UserProfileMenu from '../profile/user-profile-menu';
import type { UserProfileMenuUser } from '../profile/user-profile-menu';

const HEADER_HEIGHT = {
  xs: '4rem',
  md: '4.5rem',
} as const;

const headerBaseSx: SxProps<Theme> = (theme) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1100,

    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',

    width: '100%',
    minHeight: HEADER_HEIGHT,
    px: { xs: '1rem', sm: '1rem', md: '2rem' },
    py: '0.75rem',

    color: theme.palette.text.primary,
    backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.96 : 0.98),
    backgroundImage: isDark
      ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.26)} 0%, ${alpha(
          theme.palette.background.paper,
          0.98,
        )} 44%, ${alpha(theme.palette.secondary.main, 0.22)} 100%)`
      : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(
          theme.palette.background.paper,
          0.98,
        )} 48%, ${alpha(theme.palette.secondary.main, 0.12)} 100%)`,
    borderBottom: `1px solid ${alpha(theme.palette.divider, isDark ? 0.95 : 1)}`,
    boxShadow: theme.shadows[isDark ? 10 : 4],

    backdropFilter: 'saturate(170%) blur(18px)',
    WebkitBackdropFilter: 'saturate(170%) blur(18px)',

    transition:
      'background-color 220ms ease, background-image 220ms ease, box-shadow 220ms ease, border-color 220ms ease',

    '&::after': {
      content: '""',
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 2,
      pointerEvents: 'none',
      background: `linear-gradient(90deg, transparent 0%, ${alpha(
        theme.palette.primary.main,
        0.88,
      )} 22%, ${alpha(theme.palette.secondary.main, 0.88)} 78%, transparent 100%)`,
    },

    '@media (max-width: 480px)': {
      px: '0.75rem',
    },

    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  };
};

const headerScrolledSx: SxProps<Theme> = (theme) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.98 : 1),
    borderBottomColor: alpha(theme.palette.secondary.main, isDark ? 0.5 : 0.35),
    boxShadow: theme.shadows[isDark ? 14 : 6],
  };
};

const headerInnerSx: SxProps<Theme> = {
  position: 'relative',
  width: '100%',
  maxWidth: 'none',
  mx: 0,

  display: 'grid',
  gridTemplateColumns: {
    xs: '1fr auto',
    md: 'minmax(220px, 1fr) auto minmax(260px, 1fr)',
    lg: 'minmax(260px, 1fr) auto minmax(300px, 1fr)',
  },
  alignItems: 'center',
  columnGap: { xs: 1.5, md: 2.5 },

  minHeight: { xs: 40, sm: 44, md: 48 },

  '@media (max-width: 480px)': {
    columnGap: 1,
  },
};

const leftSectionSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  justifySelf: 'start',
  flex: 1,
  minWidth: 0,
  gap: { xs: '0.75rem', sm: '1.25rem' },
};

const middleSectionSx: SxProps<Theme> = {
  display: { xs: 'none', md: 'flex' },
  justifySelf: 'center',
  justifyContent: 'center',
  alignItems: 'center',
  minWidth: 0,
  textAlign: 'center',
};

const navSectionSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  justifySelf: 'end',
  flex: 1,
  width: '100%',
  minWidth: { xs: 'auto', md: 260, lg: 300 },
  gap: 1,
};

const logoButtonSx: SxProps<Theme> = (theme) => ({
  p: 0,
  m: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',

  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',

  flexShrink: 0,
  width: { xs: 132, sm: 150, md: 176, lg: 200 },
  height: { xs: 42, sm: 46, md: 50, lg: 52 },
  overflow: 'visible',

  borderRadius: 1,
  transition: 'transform 180ms ease, filter 180ms ease',

  '&:hover': {
    transform: 'translateY(-1px)',
    filter: 'brightness(1.08)',
  },

  '&:focus-visible': {
    outline: `2px solid ${alpha(theme.palette.secondary.main, 0.9)}`,
    outlineOffset: 3,
  },

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',

    '&:hover': {
      transform: 'none',
    },
  },
});

const versionLinkSx: SxProps<Theme> = (theme) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',

    alignSelf: 'center',
    whiteSpace: 'nowrap',

    mt: '0.25rem',
    ml: {
      xs: '-0.85rem',
      sm: '-1rem',
      md: '-1.35rem',
      lg: '-1.55rem',
    },

    px: 0.8,
    py: 0.45,
    borderRadius: 999,

    color: isDark ? theme.palette.common.white : theme.palette.primary.main,
    fontWeight: 900,
    fontSize: { xs: '0.72rem', sm: '0.8rem', md: '0.84rem' },
    letterSpacing: '0.055em',
    lineHeight: 1,
    textDecoration: 'none',
    textTransform: 'uppercase',

    backgroundColor: isDark
      ? alpha(theme.palette.background.default, 0.72)
      : alpha(theme.palette.common.white, 0.88),
    border: `1px solid ${alpha(theme.palette.secondary.main, isDark ? 0.52 : 0.42)}`,
    boxShadow: `0 0 0 1px ${alpha(
      theme.palette.common.black,
      isDark ? 0.16 : 0.04,
    )}, 0 0 14px ${alpha(theme.palette.secondary.main, isDark ? 0.18 : 0.12)}`,

    transition:
      'color 180ms ease, background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',

    '&:hover': {
      color: theme.palette.secondary.main,
      backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.95 : 1),
      borderColor: alpha(theme.palette.secondary.main, 0.72),
      boxShadow: `0 0 18px ${alpha(theme.palette.secondary.main, 0.24)}`,
      transform: 'translateY(-1px)',
    },

    '&:focus-visible': {
      outline: `2px solid ${alpha(theme.palette.secondary.main, 0.9)}`,
      outlineOffset: '0.25rem',
    },

    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',

      '&:hover': {
        transform: 'none',
      },
    },
  };
};

const desktopNavListSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: { md: '0.35rem', lg: '0.5rem' },

  listStyle: 'none',
  p: 0,
  m: 0,

  '& li': {
    display: 'flex',
    alignItems: 'center',
  },
};

const navButtonSx: SxProps<Theme> = (theme) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    position: 'relative',

    color: theme.palette.text.primary,
    fontFamily: theme.typography.button.fontFamily,
    fontWeight: 900,
    fontSize: { xs: '1rem', md: '0.84rem', lg: '0.9rem' },
    lineHeight: 1.2,
    letterSpacing: { xs: '0.02em', md: '0.07em' },
    textDecoration: 'none',
    textTransform: { xs: 'none', md: 'uppercase' },

    background: 'transparent',
    border: 0,
    borderRadius: 999,
    cursor: 'pointer',

    whiteSpace: 'nowrap',
    px: { xs: 1.5, md: 1.25, lg: 1.45 },
    py: { xs: 1, md: 0.75 },
    minWidth: 0,

    textShadow: isDark
      ? `0 1px 2px ${alpha(theme.palette.common.black, 0.72)}`
      : 'none',

    transition:
      'color 180ms ease, background-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',

    '&::after': {
      content: '""',
      position: 'absolute',
      left: '50%',
      right: '50%',
      bottom: 4,
      height: 2,
      borderRadius: 999,
      background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
      opacity: 0,
      transition: 'left 180ms ease, right 180ms ease, opacity 180ms ease',
    },

    '&:hover': {
      color: theme.palette.secondary.main,
      backgroundColor: alpha(theme.palette.secondary.main, isDark ? 0.14 : 0.1),
      boxShadow: `0 0 18px ${alpha(theme.palette.secondary.main, isDark ? 0.16 : 0.1)}`,
      transform: 'translateY(-1px)',

      '&::after': {
        left: 14,
        right: 14,
        opacity: 1,
      },
    },

    '&:focus-visible': {
      outline: `2px solid ${alpha(theme.palette.secondary.main, 0.9)}`,
      outlineOffset: '0.25rem',
    },

    '&[aria-current="page"]': {
      color: isDark ? theme.palette.common.white : theme.palette.primary.main,
      backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.22 : 0.1),
      boxShadow: `inset 0 0 0 1px ${alpha(
        theme.palette.primary.main,
        isDark ? 0.44 : 0.28,
      )}, 0 0 18px ${alpha(theme.palette.primary.main, isDark ? 0.16 : 0.08)}`,

      '&::after': {
        left: 14,
        right: 14,
        opacity: 1,
      },
    },

    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',

      '&::after': {
        transition: 'none',
      },

      '&:hover': {
        transform: 'none',
      },
    },
  };
};

const menuButtonSx: SxProps<Theme> = (theme) => ({
  display: { xs: 'inline-flex', md: 'none' },
  alignItems: 'center',
  justifyContent: 'center',

  color: theme.palette.text.primary,
  font: 'inherit',
  fontSize: '2rem',
  lineHeight: 1,

  cursor: 'pointer',
  background: 'none',
  border: 'none',

  transition: 'color 180ms ease, background-color 180ms ease, transform 180ms ease',

  '&:hover': {
    color: theme.palette.secondary.main,
    backgroundColor: alpha(theme.palette.secondary.main, 0.12),
    transform: 'scale(1.08)',
  },

  '&:focus-visible': {
    outline: `2px solid ${alpha(theme.palette.secondary.main, 0.9)}`,
    outlineOffset: '0.35rem',
    borderRadius: '0.25rem',
  },

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',

    '&:hover': {
      transform: 'none',
    },
  },
});

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
  userProfileEndpoint = '/api/V1/auth/{username}',

  dashboardHref = '/dashboard',
  profileHref = '/profile',
  settingsHref = '/settings',
  userMenuActions,

  onAuthSuccess,
  onLogout,
  onLogoutSuccess,
  onLogoutError,
}: HeaderProps): React.ReactElement {
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

  const logoImageStyle = React.useMemo<React.CSSProperties>(
    () => ({
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      objectPosition: 'left center',
      filter: `drop-shadow(0 0 3px ${alpha(
        theme.palette.common.white,
        theme.palette.mode === 'dark' ? 0.72 : 0.38,
      )}) drop-shadow(0 0 8px ${alpha(theme.palette.primary.main, 0.22)})`,
    }),
    [theme],
  );

  const authButtonsSx = React.useMemo<SxProps<Theme>>(
    () => ({
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
        fontWeight: 900,
        lineHeight: 1.2,
        letterSpacing: '0.04em',
        textTransform: 'none',
        whiteSpace: 'nowrap',
      },
    }),
    [],
  );

  const mobileAuthButtonsSx = React.useMemo<SxProps<Theme>>(
    () => ({
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
        fontWeight: 900,
        letterSpacing: '0.04em',
        textTransform: 'none',
      },
    }),
    [],
  );

  const mobileNavThemeSx = React.useMemo<SxProps<Theme>>(
    () => ({
      backgroundColor: alpha(
        theme.palette.background.paper,
        theme.palette.mode === 'dark' ? 0.98 : 1,
      ),
      backgroundImage: theme.palette.mode === 'dark'
        ? `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.98)}, ${alpha(
            theme.palette.background.default,
            0.98,
          )})`
        : 'none',
      border: `1px solid ${theme.palette.divider}`,
      boxShadow: theme.shadows[theme.palette.mode === 'dark' ? 14 : 6],
      backdropFilter: 'saturate(170%) blur(18px)',
      WebkitBackdropFilter: 'saturate(170%) blur(18px)',

      '& .MuiButton-root': {
        width: '100%',
        justifyContent: 'flex-start',
      },

      '& [data-auth-control="true"]': {
        width: '100%',
        pt: 1,
        mt: 1,
        borderTop: `1px solid ${theme.palette.divider}`,
      },
    }),
    [theme],
  );

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
          return (
            fallbackUser ?? createAuthenticatedFallbackUser(normalizedUsername)
          );
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
        return (
          fallbackUser ?? createAuthenticatedFallbackUser(normalizedUsername)
        );
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
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return undefined;
    }

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

    mediaQuery.addEventListener?.('change', closeMenuOnDesktop);

    return () => {
      mediaQuery.removeEventListener?.('change', closeMenuOnDesktop);
    };
  }, [theme]);

  React.useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const activePathname = mounted ? pathname : null;
  const displayVersion = latestVersion ?? normalizeVersion(version);

  const releaseUrl = displayVersion
    ? `${githubReleasesUrl}/tag/v${displayVersion}`
    : githubReleasesUrl;

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
              color: theme.palette.secondary.main,
              filter: `drop-shadow(0 0 6px ${alpha(
                theme.palette.secondary.main,
                0.45,
              )})`,
            }}
          />
        </Box>
      );
    }

    if (currentUser) {
      const currentUsername = resolveUsername(currentUser);
      const resolvedProfileHref = buildUserProfileUrl(
        profileHref,
        currentUsername,
      );

      return (
        <UserProfileMenu
          user={currentUser}
          logoutEndpoint={logoutEndpoint}
          dashboardHref={dashboardHref}
          profileHref={resolvedProfileHref}
          settingsHref={settingsHref}
          actions={userMenuActions ? [...userMenuActions] : undefined}
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
        style={style}
        sx={mergeSx(headerBaseSx, scrolled ? headerScrolledSx : undefined, sx)}
        suppressHydrationWarning
      >
        <Box sx={headerInnerSx}>
          <Stack direction="row" spacing={0} sx={leftSectionSx}>
            <Box
              component="button"
              type="button"
              aria-label="Go to Helix home"
              onClick={() => navigate('/')}
              sx={logoButtonSx}
            >
              <Image
                src={logo}
                alt={logoAlt}
                width={600}
                height={200}
                priority
                sizes="(max-width: 600px) 132px, (max-width: 900px) 176px, 190px"
                style={logoImageStyle}
              />
            </Box>

            <MuiLink
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              underline="none"
              suppressHydrationWarning
              sx={versionLinkSx}
            >
              V{displayVersion}
            </MuiLink>
          </Stack>

          <Box
            component="nav"
            aria-label="Primary navigation"
            sx={middleSectionSx}
          >
            <Box component="ul" sx={desktopNavListSx}>
              {pages.map((page) => {
                const active = isActivePath(activePathname, page.url);

                return (
                  <Box key={`${page.name}:${page.url}`} component="li">
                    <Button
                      onClick={() => navigate(page.url)}
                      aria-current={active ? 'page' : undefined}
                      suppressHydrationWarning
                      sx={navButtonSx}
                    >
                      {page.name}
                    </Button>
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Box sx={navSectionSx}>
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
              onClick={() => setMenuOpen((current) => !current)}
              sx={menuButtonSx}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="helix-mobile-navigation"
              suppressHydrationWarning
            >
              <MenuIcon fontSize="medium" />
            </IconButton>

            <Box
              id="helix-mobile-navigation"
              component="ul"
              aria-label="Mobile navigation"
              sx={mergeSx(getMobileNavListSx(menuOpen, theme), mobileNavThemeSx)}
            >
              {pages.map((page) => {
                const active = isActivePath(activePathname, page.url);

                return (
                  <Box key={`${page.name}:${page.url}`} component="li">
                    <Button
                      onClick={() => navigateAndClose(page.url)}
                      aria-current={active ? 'page' : undefined}
                      suppressHydrationWarning
                      sx={navButtonSx}
                    >
                      {page.name}
                    </Button>
                  </Box>
                );
              })}

              <Box component="li" data-auth-control="true">
                {renderAuthControl('mobile')}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box
        aria-hidden
        sx={{
          height: HEADER_HEIGHT,
        }}
      />
    </>
  );
}

export default Header;

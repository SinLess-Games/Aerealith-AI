// libs/ui/src/components/layout/Header.tsx

'use client';

import MenuIcon from '@mui/icons-material/Menu';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { useTheme, type SxProps, type Theme } from '@mui/material/styles';
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

const headerBaseSx: SxProps<Theme> = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1100,

  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',

  width: '100%',
  minHeight: { xs: '4rem', md: '4.5rem' },
  px: { xs: '1rem', sm: '1rem', md: '2rem' },
  py: '0.75rem',

  color: '#ffffff',
  background:
    'var(--header-gradient, linear-gradient(135deg, rgba(2, 35, 113, 0.92), rgba(98, 0, 238, 0.82)))',
  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: 'var(--header-shadow, 0 10px 30px rgba(0, 0, 0, 0.25))',

  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',

  transition:
    'background 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease',

  '@media (max-width: 480px)': {
    px: '0.75rem',
  },

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
};

const headerScrolledSx: SxProps<Theme> = {
  background: 'var(--header-blur-bg, rgba(2, 35, 113, 0.86))',
  borderBottomColor: 'rgba(255, 255, 255, 0.16)',
  boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
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

const logoButtonSx: SxProps<Theme> = {
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

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',

    '&:hover': {
      transform: 'none',
    },
  },
};

const versionLinkSx: SxProps<Theme> = {
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

  px: 0.7,
  py: 0.42,
  borderRadius: 1,

  color: '#8be9ff',
  fontWeight: 800,
  fontSize: { xs: '0.75rem', sm: '0.85rem', md: '0.9rem' },
  letterSpacing: '0.03em',
  lineHeight: 1,
  textDecoration: 'none',

  backgroundColor: 'rgba(2, 35, 113, 0.38)',
  border: '1px solid rgba(139, 233, 255, 0.34)',
  textShadow:
    '0 0 6px rgba(139, 233, 255, 0.85), 0 0 12px rgba(246, 6, 111, 0.32)',
  boxShadow:
    '0 0 12px rgba(139, 233, 255, 0.18), inset 0 0 8px rgba(255, 255, 255, 0.08)',

  transition:
    'color 0.2s ease-in-out, font-weight 0.2s ease-in-out, text-shadow 0.2s ease-in-out, background-color 0.2s ease-in-out, border-color 0.2s ease-in-out',

  '&:hover': {
    color: '#ffffff',
    fontWeight: 800,
    backgroundColor: 'rgba(246, 6, 111, 0.32)',
    borderColor: 'rgba(246, 6, 111, 0.55)',
    textShadow:
      '0 0 8px rgba(255, 255, 255, 0.9), 0 0 14px rgba(246, 6, 111, 0.6)',
  },

  '&:focus-visible': {
    color: '#ffffff',
    outline: '2px solid rgba(246, 6, 111, 0.75)',
    outlineOffset: '0.25rem',
    borderRadius: '0.25rem',
  },

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
};

const desktopNavListSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: { md: '2rem', lg: '2.25rem' },

  listStyle: 'none',
  p: 0,
  m: 0,

  '& li': {
    display: 'flex',
    alignItems: 'center',
  },
};

const navButtonSx: SxProps<Theme> = {
  color: '#ffffff',
  font: 'inherit',
  fontWeight: 500,
  lineHeight: 1.2,
  textDecoration: 'none',
  textTransform: 'none',

  background: 'transparent',
  border: 0,
  borderBottom: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',

  whiteSpace: 'nowrap',
  px: 1,
  py: 0.5,
  minWidth: 0,

  transition:
    'color 0.2s ease-in-out, border-color 0.2s ease-in-out, text-shadow 0.2s ease-in-out',

  '&:hover': {
    color: '#f6066f',
    backgroundColor: 'transparent',
  },

  '&:focus-visible': {
    outline: '2px solid rgba(246, 6, 111, 0.75)',
    outlineOffset: '0.35rem',
    borderRadius: '0.25rem',
  },

  '&[aria-current="page"]': {
    fontWeight: 700,
    borderBottomColor: '#f6066f',
  },

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
};

const menuButtonSx: SxProps<Theme> = {
  display: { xs: 'inline-flex', md: 'none' },
  alignItems: 'center',
  justifyContent: 'center',

  color: '#ffffff',
  font: 'inherit',
  fontSize: '2rem',
  lineHeight: 1,

  cursor: 'pointer',
  background: 'none',
  border: 'none',

  transition: 'color 0.2s ease, transform 0.2s ease',

  '&:hover': {
    color: '#f6066f',
    transform: 'scale(1.1)',
  },

  '&:focus-visible': {
    outline: '2px solid rgba(246, 6, 111, 0.75)',
    outlineOffset: '0.35rem',
    borderRadius: '0.25rem',
  },

  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',

    '&:hover': {
      transform: 'none',
    },
  },
};

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
              sx={getMobileNavListSx(menuOpen, theme)}
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
          height: { xs: '4rem', md: '4.5rem' },
        }}
      />
    </>
  );
}

export default Header;
'use client';

import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
}

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

export function Header({
  logo,
  version,
  pages,
  style,
  sx,
  logoAlt = 'Helix logo',
  githubReleasesUrl = 'https://github.com/SinLess-Games/Helix/releases',
  latestReleaseApiUrl = 'https://api.github.com/repos/SinLess-Games/Helix/releases/latest',
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [latestVersion, setLatestVersion] = React.useState<string | null>(null);
  const [scrolled, setScrolled] = React.useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();

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
    const mediaQuery = window.matchMedia(theme.breakpoints.up('md').replace('@media ', ''));

    const closeMenuOnDesktop = (event: MediaQueryListEvent | MediaQueryList): void => {
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

  const headerClassName = scrolled
    ? `${styles.header} ${styles.scrolled}`
    : styles.header;

  return (
    <>
      <Box
        component="header"
        className={headerClassName}
        style={style}
        sx={sx}
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
              md: '1fr auto 1fr',
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
              const active = isActivePath(pathname, page.url);

              return (
                <Button
                  key={`${page.name}:${page.url}`}
                  onClick={() => navigate(page.url)}
                  aria-current={active ? 'page' : undefined}
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
              minWidth: { xs: 'auto', md: 180, lg: 210 },
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <IconButton
              onClick={() => setMenuOpen(true)}
              sx={{
                color: '#fff',
                display: { xs: 'inline-flex', md: 'none' },
              }}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="helix-mobile-navigation"
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
            const active = isActivePath(pathname, page.url);

            return (
              <ListItem key={`${page.name}:${page.url}`} disablePadding>
                <ListItemButton
                  onClick={() => navigateAndClose(page.url)}
                  selected={active}
                  aria-current={active ? 'page' : undefined}
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
      </Drawer>

      <Box aria-hidden sx={{ height: { xs: 52, sm: 56, md: 58, lg: 60 } }} />
    </>
  );
}

export default Header;
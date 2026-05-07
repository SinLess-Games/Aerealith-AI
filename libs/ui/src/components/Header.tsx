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
import useMediaQuery from '@mui/material/useMediaQuery';
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
  githubReleasesUrl = 'https://github.com/Sinless777/Helix/releases',
  latestReleaseApiUrl = 'https://api.github.com/repos/Sinless777/Helix/releases/latest',
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [latestVersion, setLatestVersion] = React.useState<string | null>(null);
  const [scrolled, setScrolled] = React.useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const mdUp = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });

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
    if (mdUp) {
      setMenuOpen(false);
    }
  }, [mdUp]);

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
            maxWidth: 1280,
            mx: 'auto',
            px: { xs: 2, sm: 3, md: 4, lg: 5 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Stack
            direction="row"
            spacing={2}
            className={styles.leftSection}
            sx={{
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
                flexShrink: 0,
              }}
            >
              <Image
                src={logo}
                alt={logoAlt}
                width={120}
                height={40}
                priority
                style={{
                  width: 'auto',
                  height: '40px',
                  objectFit: 'contain',
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
              }}
            >
              V{displayVersion}
            </MuiLink>
          </Stack>

          {mdUp ? (
            <Stack
              component="nav"
              direction="row"
              className={styles.middleSection}
              aria-label="Primary navigation"
              sx={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
                flexWrap: 'wrap',
                columnGap: { md: 2.25, lg: 3 },
                rowGap: 0.75,
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
          ) : null}

          <Box className={styles.navSection}>
            {!mdUp ? (
              <IconButton
                onClick={() => setMenuOpen(true)}
                sx={{ color: '#fff' }}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="helix-mobile-navigation"
              >
                <MenuIcon fontSize="large" />
              </IconButton>
            ) : null}
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

      <Box aria-hidden sx={{ height: { xs: 64, md: 72 } }} />
    </>
  );
}

export default Header;
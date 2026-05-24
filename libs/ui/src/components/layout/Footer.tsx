// libs/ui/src/components/layout/Footer.tsx

'use client';

import * as React from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  alpha,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import Image, { type StaticImageData } from 'next/image';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';

import type {
  FooterAction,
  FooterBrandProps,
  FooterLinkGroupsProps,
  FooterLogo,
  FooterProps,
  FooterSocialLink,
  FooterSocialLinksProps,
  FooterVariant,
  NormalizedFooterLink,
} from '../../types/footer';
import { mergeSx } from '../../utils';
import {
  buildCopyrightText,
  buildReleaseUrl,
  buildVersionLabel,
  isActiveFooterPath,
  isInternalUrl,
  normalizeFooterLinkGroups,
  normalizeFooterLinks,
} from './Footer.functions';

function isImageLogo(
  logo: FooterLogo | undefined,
): logo is string | StaticImageData {
  return (
    typeof logo === 'string' ||
    Boolean((logo as StaticImageData | undefined)?.src)
  );
}

function getFooterSurfaceSx(
  theme: Theme,
  variant: FooterVariant,
): SxProps<Theme> {
  const isDark = theme.palette.mode === 'dark';

  if (variant === 'minimal') {
    return {
      color: theme.palette.text.primary,
      bgcolor: 'transparent',
      borderTop: `1px solid ${theme.palette.divider}`,
    };
  }

  if (variant === 'glass') {
    return {
      color: theme.palette.text.primary,
      backgroundColor: alpha(
        theme.palette.background.paper,
        isDark ? 0.94 : 0.98,
      ),
      backgroundImage: isDark
        ? `radial-gradient(circle at 8% 10%, ${alpha(
            theme.palette.secondary.main,
            0.1,
          )}, transparent 30%), radial-gradient(circle at 90% 18%, ${alpha(
            theme.palette.primary.main,
            0.16,
          )}, transparent 34%), linear-gradient(145deg, ${alpha(
            theme.palette.background.paper,
            0.96,
          )}, ${alpha(theme.palette.background.default, 0.98)})`
        : `radial-gradient(circle at 8% 10%, ${alpha(
            theme.palette.secondary.main,
            0.08,
          )}, transparent 30%), radial-gradient(circle at 90% 18%, ${alpha(
            theme.palette.primary.main,
            0.08,
          )}, transparent 34%), linear-gradient(145deg, ${
            theme.palette.background.paper
          }, ${alpha(theme.palette.background.default, 0.78)})`,
      borderTop: `1px solid ${alpha(theme.palette.divider, isDark ? 0.9 : 1)}`,
      boxShadow: theme.shadows[isDark ? 8 : 2],
      backdropFilter: 'saturate(170%) blur(18px)',
      WebkitBackdropFilter: 'saturate(170%) blur(18px)',
    };
  }

  return {
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.background.paper,
    backgroundImage: isDark
      ? `linear-gradient(135deg, ${alpha(
          theme.palette.primary.main,
          0.18,
        )}, ${alpha(theme.palette.background.paper, 0.96)}, ${alpha(
          theme.palette.secondary.main,
          0.12,
        )})`
      : `linear-gradient(135deg, ${alpha(
          theme.palette.primary.main,
          0.08,
        )}, ${theme.palette.background.paper}, ${alpha(
          theme.palette.secondary.main,
          0.08,
        )})`,
    borderTop: `1px solid ${theme.palette.divider}`,
    boxShadow: theme.shadows[theme.palette.mode === 'dark' ? 6 : 1],
  };
}

function renderFooterLink(
  link: NormalizedFooterLink,
  active: boolean,
  sx?: SxProps<Theme>,
): React.ReactElement {
  const linkSx: SxProps<Theme> = mergeSx(
    (theme) => ({
      display: 'inline-flex',
      alignItems: 'center',
      width: 'fit-content',
      maxWidth: '100%',

      color: active ? theme.palette.primary.main : theme.palette.text.secondary,
      fontSize: '0.9rem',
      fontWeight: active ? 900 : 650,
      lineHeight: 1.35,

      textDecoration: 'none',
      textUnderlineOffset: '0.24em',

      whiteSpace: 'normal',
      wordBreak: 'normal',
      overflowWrap: 'break-word',
      hyphens: 'none',

      transition:
        'color 180ms ease, text-shadow 180ms ease, transform 180ms ease',

      '&:hover': {
        color: theme.palette.secondary.main,
        textDecoration: 'underline',
        textShadow: `0 0 10px ${alpha(theme.palette.secondary.main, 0.28)}`,
        transform: 'translateX(2px)',
      },

      '&:focus-visible': {
        outline: `2px solid ${alpha(theme.palette.secondary.main, 0.85)}`,
        outlineOffset: 4,
        borderRadius: 1,
      },

      '@media (prefers-reduced-motion: reduce)': {
        transition: 'none',

        '&:hover': {
          transform: 'none',
        },
      },
    }),
    sx,
  );

  if (link.disabled) {
    return (
      <Typography
        component="span"
        sx={mergeSx(linkSx, {
          opacity: 0.45,
          pointerEvents: 'none',
        })}
      >
        {link.label}
      </Typography>
    );
  }

  if (isInternalUrl(link.href)) {
    return (
      <MuiLink
        component={NextLink as React.ElementType}
        href={link.href}
        aria-current={active ? 'page' : undefined}
        sx={linkSx}
      >
        {link.label}
      </MuiLink>
    );
  }

  return (
    <MuiLink
      href={link.href}
      target={link.target}
      rel={link.rel}
      aria-current={active ? 'page' : undefined}
      sx={linkSx}
    >
      {link.label}
    </MuiLink>
  );
}

function renderAction(action: FooterAction, index: number): React.ReactElement {
  const key = `${String(action.label)}-${index}`;

  const buttonSx: SxProps<Theme> = {
    borderRadius: 999,
    px: 2.25,
    py: 0.85,
    fontWeight: 900,
    textTransform: 'none',
    letterSpacing: '0.02em',
  };

  if (action.href && isInternalUrl(action.href)) {
    return (
      <Button
        key={key}
        component={NextLink as React.ElementType}
        href={action.href}
        disabled={action.disabled}
        variant={action.variant ?? 'contained'}
        color={action.color ?? 'primary'}
        startIcon={action.startIcon}
        endIcon={action.endIcon}
        sx={buttonSx}
      >
        {action.label}
      </Button>
    );
  }

  if (action.href) {
    return (
      <Button
        key={key}
        component="a"
        href={action.href}
        target={action.target ?? '_blank'}
        rel={action.rel ?? 'noopener noreferrer'}
        disabled={action.disabled}
        variant={action.variant ?? 'contained'}
        color={action.color ?? 'primary'}
        startIcon={action.startIcon}
        endIcon={action.endIcon}
        sx={buttonSx}
      >
        {action.label}
      </Button>
    );
  }

  return (
    <Button
      key={key}
      onClick={action.onClick}
      disabled={action.disabled}
      variant={action.variant ?? 'contained'}
      color={action.color ?? 'primary'}
      startIcon={action.startIcon}
      endIcon={action.endIcon}
      sx={buttonSx}
    >
      {action.label}
    </Button>
  );
}

function FooterBrand({
  brandName,
  tagline,
  logo,
  logoAlt,
  logoHref,
  brandSx,
}: FooterBrandProps): React.ReactElement {
  const theme = useTheme();

  const logoContent = isImageLogo(logo) ? (
    <Box
      sx={{
        position: 'relative',
        width: { xs: 140, sm: 160 },
        height: 42,
      }}
    >
      <Image
        src={logo}
        alt={logoAlt}
        fill
        sizes="160px"
        style={{
          objectFit: 'contain',
          objectPosition: 'left center',
          filter: `drop-shadow(0 0 3px ${alpha(
            theme.palette.common.white,
            theme.palette.mode === 'dark' ? 0.64 : 0.32,
          )}) drop-shadow(0 0 8px ${alpha(theme.palette.primary.main, 0.22)})`,
        }}
      />
    </Box>
  ) : logo ? (
    logo
  ) : null;

  return (
    <Stack
      spacing={1.1}
      sx={mergeSx(
        {
          width: '100%',
          minWidth: 0,
        },
        brandSx,
      )}
    >
      {logoContent ? (
        <MuiLink
          component={NextLink as React.ElementType}
          href={logoHref}
          aria-label="Go to home page"
          sx={{
            display: 'inline-flex',
            width: 'fit-content',
            textDecoration: 'none',
          }}
        >
          {logoContent}
        </MuiLink>
      ) : null}

      {brandName ? (
        <Typography
          component="h2"
          sx={{
            color: theme.palette.text.primary,
            fontFamily: theme.typography.h5.fontFamily,
            fontWeight: 900,
            fontSize: { xs: '1.25rem', md: '1.4rem' },
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          {brandName}
        </Typography>
      ) : null}

      {tagline ? (
        <Typography
          sx={{
            color: theme.palette.text.secondary,
            lineHeight: 1.55,
            maxWidth: 620,
          }}
        >
          {tagline}
        </Typography>
      ) : null}
    </Stack>
  );
}

function FooterLinkGroups({
  groups,
  pathname,
  linkGroupSx,
}: FooterLinkGroupsProps): React.ReactElement | null {
  if (!groups.length) {
    return null;
  }

  return (
    <>
      {groups.map((group) => {
        const groupId = `footer-group-${group.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}`;

        return (
          <Box
            key={group.title}
            component="section"
            aria-labelledby={groupId}
            sx={mergeSx(
              {
                width: '100%',
                minWidth: 0,
              },
              linkGroupSx,
            )}
          >
            <Typography
              id={groupId}
              component="h3"
              sx={(theme) => ({
                mb: 0.9,
                width: '100%',
                color: theme.palette.text.primary,
                fontFamily: theme.typography.overline.fontFamily,
                fontSize: '0.78rem',
                fontWeight: 900,
                letterSpacing: '0.12em',
                lineHeight: 1.25,
                textAlign: 'center',
                textTransform: 'uppercase',
              })}
            >
              {group.title}
            </Typography>

            <Box
              component="ul"
              sx={(theme) => ({
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                },
                columnGap: { xs: 2.5, sm: 3.25, md: 3.75, lg: 4.25, xl: 4.75 },
                rowGap: 0.7,
                width: '100%',
                pl: { xs: 2.25, sm: 2.75 },
                pr: 0,
                py: 0,
                m: 0,
                listStyleType: 'disc',
                listStylePosition: 'outside',

                '& > li': {
                  display: 'list-item',
                  minWidth: 0,
                  pl: 0.3,
                  lineHeight: 1.35,
                },

                '& > li::marker': {
                  color: alpha(theme.palette.text.secondary, 0.9),
                  fontSize: '0.75em',
                },
              })}
            >
              {group.links.map((link) => (
                <Box
                  key={`${group.title}:${link.href}:${link.label}`}
                  component="li"
                  sx={{
                    px: 0.35,
                    py: 0.2,
                  }}
                >
                  {renderFooterLink(
                    link,
                    isActiveFooterPath(pathname, link.href),
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        );
      })}
    </>
  );
}

function FooterSocialLinks({
  socialLinks,
}: FooterSocialLinksProps): React.ReactElement | null {
  if (!socialLinks.length) {
    return null;
  }

  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      {socialLinks.map((link: FooterSocialLink, index) => {
        const normalized = normalizeFooterLinks([link])[0];

        if (!normalized) {
          return null;
        }

        const iconButtonSx: SxProps<Theme> = (theme) => ({
          width: 36,
          height: 36,
          color: theme.palette.text.primary,
          border: `1px solid ${alpha(theme.palette.text.secondary, 0.2)}`,
          bgcolor: alpha(
            theme.palette.background.paper,
            theme.palette.mode === 'dark' ? 0.5 : 0.8,
          ),
          boxShadow: `inset 0 1px 0 ${alpha(
            theme.palette.common.white,
            theme.palette.mode === 'dark' ? 0.06 : 0.65,
          )}`,

          '&:hover': {
            color: theme.palette.secondary.main,
            bgcolor: alpha(theme.palette.secondary.main, 0.1),
            borderColor: alpha(theme.palette.secondary.main, 0.58),
            boxShadow: `0 0 18px ${alpha(theme.palette.secondary.main, 0.18)}`,
          },
        });

        const ariaLabel = link.ariaLabel ?? `Open ${normalized.label}`;

        if (isInternalUrl(normalized.href)) {
          return (
            <IconButton
              key={`${normalized.href}:${index}`}
              component={NextLink as React.ElementType}
              href={normalized.href}
              aria-label={ariaLabel}
              disabled={normalized.disabled}
              sx={iconButtonSx}
            >
              {link.icon ?? normalized.label.slice(0, 1)}
            </IconButton>
          );
        }

        return (
          <IconButton
            key={`${normalized.href}:${index}`}
            component="a"
            href={normalized.href}
            target={normalized.target}
            rel={normalized.rel}
            aria-label={ariaLabel}
            disabled={normalized.disabled}
            sx={iconButtonSx}
          >
            {link.icon ?? normalized.label.slice(0, 1)}
          </IconButton>
        );
      })}
    </Stack>
  );
}

export function Footer({
  brandName = 'Helix AI',
  tagline,
  logo,
  logoAlt = 'Helix AI logo',
  logoHref = '/',
  version,
  versionPrefix = 'V',
  releasesUrl = 'https://github.com/SinLess-Games/Helix/releases',
  linkGroups = [],
  legalLinks = [],
  socialLinks = [],
  actions = [],
  copyrightHolder,
  copyrightStartYear,
  copyrightText,
  children,
  variant = 'glass',
  maxWidth = 'none',
  dense = false,
  sx,
  containerSx,
  brandSx,
  linkGroupSx,
  bottomSx,
  ...boxProps
}: FooterProps): React.ReactElement {
  const theme = useTheme();
  const pathname = usePathname();

  const normalizedGroups = React.useMemo(
    () => normalizeFooterLinkGroups(linkGroups),
    [linkGroups],
  );

  const normalizedLegalLinks = React.useMemo(
    () => normalizeFooterLinks(legalLinks),
    [legalLinks],
  );

  const versionLabel = buildVersionLabel(version, versionPrefix);

  const releaseHref = version
    ? buildReleaseUrl({
        baseUrl: releasesUrl,
        version,
      })
    : releasesUrl;

  const resolvedCopyright =
    copyrightText ??
    buildCopyrightText({
      holder: copyrightHolder,
      startYear: copyrightStartYear,
    });

  const surfaceSx = getFooterSurfaceSx(theme, variant);

  return (
    <Box
      component="footer"
      {...boxProps}
      sx={mergeSx(
        {
          position: 'relative',
          width: '100vw',
          maxWidth: '100vw',
          marginInline: 'calc(50% - 50vw)',
          overflow: 'hidden',
          overflowX: 'clip',
          boxSizing: 'border-box',
          mt: 'auto',

          '&::before':
            variant === 'glass'
              ? {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background: `linear-gradient(90deg, transparent 0%, ${alpha(
                    theme.palette.primary.main,
                    0.18,
                  )} 22%, ${alpha(
                    theme.palette.secondary.main,
                    0.16,
                  )} 78%, transparent 100%)`,
                  opacity: theme.palette.mode === 'dark' ? 1 : 0.75,
                }
              : undefined,

          '&::after':
            variant === 'glass'
              ? {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  pointerEvents: 'none',
                  background: `linear-gradient(90deg, transparent 0%, ${alpha(
                    theme.palette.primary.main,
                    0.8,
                  )} 22%, ${alpha(
                    theme.palette.secondary.main,
                    0.78,
                  )} 78%, transparent 100%)`,
                }
              : undefined,
        },
        surfaceSx,
        sx,
      )}
    >
      <Container
        maxWidth={false}
        disableGutters
        sx={mergeSx(
          {
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth,
            px: { xs: 2.5, md: 5 },
            pt: dense ? { xs: 2.25, md: 2.5 } : { xs: 2.75, md: 3 },
            pb: dense ? { xs: 1.1, md: 1.25 } : { xs: 1.25, md: 1.4 },
            mx: 0,
            boxSizing: 'border-box',
          },
          containerSx,
        )}
      >
        <Stack spacing={{ xs: 1.65, md: 1.9 }} sx={{ width: '100%' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                lg: normalizedGroups.length
                  ? 'minmax(520px, 1.3fr) minmax(800px, 1.05fr)'
                  : '1fr',
                xl: normalizedGroups.length
                  ? 'minmax(680px, 1.5fr) minmax(980px, 1fr)'
                  : '1fr',
              },
              columnGap: { xs: 3.5, md: 6, lg: 8, xl: 9 },
              rowGap: { xs: 2.25, md: 2.75, lg: 3 },
              alignItems: 'start',
              width: '100%',
              minWidth: 0,
            }}
          >
            <Stack spacing={1.5} sx={{ width: '100%', minWidth: 0 }}>
              <FooterBrand
                brandName={brandName}
                tagline={tagline}
                logo={logo}
                logoAlt={logoAlt}
                logoHref={logoHref}
                brandSx={brandSx}
              />

              {actions.length ? (
                <Stack
                  direction="row"
                  spacing={1.25}
                  useFlexGap
                  flexWrap="wrap"
                  sx={{ width: '100%' }}
                >
                  {actions.map((action, index) => renderAction(action, index))}
                </Stack>
              ) : null}

              <FooterSocialLinks socialLinks={socialLinks} />
            </Stack>

            {normalizedGroups.length ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, minmax(260px, 1fr))',
                    lg: 'repeat(4, minmax(0, 1fr))',
                  },
                  columnGap: { xs: 3.5, md: 5, lg: 6, xl: 7 },
                  rowGap: { xs: 2.25, md: 2.75, lg: 3 },
                  alignItems: 'start',
                  justifySelf: 'end',
                  width: '100%',
                  minWidth: 0,
                  p: 0.25,
                }}
              >
                <FooterLinkGroups
                  groups={normalizedGroups}
                  pathname={pathname}
                  linkGroupSx={linkGroupSx}
                />
              </Box>
            ) : null}
          </Box>

          {children ? <Box sx={{ width: '100%' }}>{children}</Box> : null}

          <Divider
            sx={{
              position: 'relative',
              width: '100vw',
              maxWidth: '100vw',
              marginInline: 'calc(50% - 50vw)',
              borderColor: theme.palette.divider,
            }}
          />

          <Box
            sx={mergeSx(
              {
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md: 'minmax(0, 1fr) max-content',
                },
                alignItems: 'center',
                columnGap: 2,
                rowGap: 0.75,

                position: 'relative',
                width: '100vw',
                maxWidth: '100vw',
                minHeight: 20,
                marginInline: 'calc(50% - 50vw)',
                px: { xs: 2.5, md: 5 },
                py: 0,
                boxSizing: 'border-box',
              },
              bottomSx,
            )}
          >
            <Typography
              sx={{
                color: theme.palette.text.secondary,
                fontSize: '0.8rem',
                lineHeight: 1.2,
                minWidth: 0,
              }}
            >
              {resolvedCopyright}
            </Typography>

            <Stack
              direction="row"
              spacing={1.35}
              useFlexGap
              flexWrap="wrap"
              alignItems="center"
              justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
              sx={{
                justifySelf: { xs: 'start', md: 'end' },
                width: { xs: '100%', md: 'auto' },
                minWidth: 0,
              }}
            >
              {versionLabel ? (
                <MuiLink
                  href={releaseHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    color: theme.palette.secondary.main,
                    fontSize: '0.8rem',
                    fontWeight: 900,
                    lineHeight: 1.2,
                    textDecoration: 'none',
                    textUnderlineOffset: '0.24em',

                    '&:hover': {
                      color: theme.palette.primary.main,
                      textDecoration: 'underline',
                    },

                    '&:focus-visible': {
                      outline: `2px solid ${alpha(
                        theme.palette.secondary.main,
                        0.85,
                      )}`,
                      outlineOffset: 4,
                      borderRadius: 1,
                    },
                  }}
                >
                  {versionLabel}
                </MuiLink>
              ) : null}

              {normalizedLegalLinks.map((link) => (
                <React.Fragment key={`${link.href}:${link.label}`}>
                  {renderFooterLink(
                    link,
                    isActiveFooterPath(pathname, link.href),
                    {
                      px: 0.55,
                      fontSize: '0.8rem',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      overflowWrap: 'normal',
                    },
                  )}
                </React.Fragment>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}

export default Footer;
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
      color: 'text.primary',
      bgcolor: 'transparent',
      borderTop: `1px solid ${alpha(theme.palette.divider, isDark ? 0.65 : 1)}`,
    };
  }

  if (variant === 'glass') {
    return {
      color: '#ffffff',
      background:
        'linear-gradient(135deg, rgba(2, 19, 37, 0.82), rgba(17, 15, 48, 0.78), rgba(35, 11, 58, 0.78))',
      borderTop: '1px solid rgba(246, 6, 111, 0.24)',
      boxShadow:
        '0 -22px 80px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
    };
  }

  return {
    color: '#ffffff',
    background:
      'linear-gradient(135deg, rgba(2, 35, 113, 0.96), rgba(98, 0, 238, 0.86))',
    borderTop: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: '0 -14px 44px rgba(0, 0, 0, 0.28)',
  };
}

function renderFooterLink(
  link: NormalizedFooterLink,
  active: boolean,
  sx?: SxProps<Theme>,
): React.ReactElement {
  const linkSx: SxProps<Theme> = mergeSx(
    {
      display: 'inline-flex',
      alignItems: 'center',
      width: 'fit-content',
      color: active ? '#f6066f' : 'rgba(235, 244, 255, 0.78)',
      fontSize: '0.94rem',
      fontWeight: active ? 800 : 600,
      lineHeight: 1.45,
      textDecoration: 'none',
      textUnderlineOffset: '0.24em',
      transition:
        'color 180ms ease, text-shadow 180ms ease, transform 180ms ease',

      '&:hover': {
        color: '#ffffff',
        textDecoration: 'underline',
        textShadow: '0 0 10px rgba(246, 6, 111, 0.42)',
        transform: 'translateX(2px)',
      },

      '&:focus-visible': {
        outline: '2px solid rgba(246, 6, 111, 0.78)',
        outlineOffset: 4,
        borderRadius: 1,
      },

      '@media (prefers-reduced-motion: reduce)': {
        transition: 'none',

        '&:hover': {
          transform: 'none',
        },
      },
    },
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
    fontWeight: 800,
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
  const logoContent = isImageLogo(logo) ? (
    <Box
      sx={{
        position: 'relative',
        width: { xs: 150, sm: 172 },
        height: 48,
      }}
    >
      <Image
        src={logo}
        alt={logoAlt}
        fill
        sizes="172px"
        style={{
          objectFit: 'contain',
          objectPosition: 'left center',
          filter:
            'drop-shadow(0 0 3px rgba(255, 255, 255, 0.72)) drop-shadow(0 0 8px rgba(246, 6, 111, 0.26))',
        }}
      />
    </Box>
  ) : logo ? (
    logo
  ) : null;

  return (
    <Stack spacing={1.6} sx={mergeSx({ maxWidth: 430 }, brandSx)}>
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
            color: '#ffffff',
            fontWeight: 900,
            fontSize: { xs: '1.35rem', md: '1.55rem' },
            lineHeight: 1.12,
            letterSpacing: '-0.03em',
            textShadow: '0 0 18px rgba(246, 6, 111, 0.22)',
          }}
        >
          {brandName}
        </Typography>
      ) : null}

      {tagline ? (
        <Typography
          sx={{
            color: 'rgba(205, 222, 241, 0.82)',
            lineHeight: 1.75,
            maxWidth: 480,
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
          <Stack
            key={group.title}
            spacing={1.25}
            component="section"
            aria-labelledby={groupId}
            sx={mergeSx({ minWidth: 0 }, linkGroupSx)}
          >
            <Typography
              id={groupId}
              component="h3"
              sx={{
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 900,
                letterSpacing: '0.12em',
                lineHeight: 1.35,
                textTransform: 'uppercase',
              }}
            >
              {group.title}
            </Typography>

            <Stack component="ul" spacing={0.85} sx={{ p: 0, m: 0 }}>
              {group.links.map((link) => (
                <Box
                  key={`${group.title}:${link.href}:${link.label}`}
                  component="li"
                >
                  {renderFooterLink(
                    link,
                    isActiveFooterPath(pathname, link.href),
                  )}
                </Box>
              ))}
            </Stack>
          </Stack>
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
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {socialLinks.map((link: FooterSocialLink, index) => {
        const normalized = normalizeFooterLinks([link])[0];

        if (!normalized) {
          return null;
        }

        const iconButtonSx: SxProps<Theme> = {
          width: 40,
          height: 40,
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          bgcolor: 'rgba(255, 255, 255, 0.055)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07)',

          '&:hover': {
            color: '#ffffff',
            bgcolor: 'rgba(246, 6, 111, 0.24)',
            borderColor: 'rgba(246, 6, 111, 0.52)',
            boxShadow: '0 0 18px rgba(246, 6, 111, 0.24)',
          },
        };

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
  maxWidth = 1480,
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
          overflow: 'hidden',
          width: '100%',
          mt: 'auto',

          '&::before':
            variant === 'glass'
              ? {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background:
                    'radial-gradient(circle at 8% 10%, rgba(0, 219, 255, 0.13), transparent 28%), radial-gradient(circle at 90% 18%, rgba(246, 6, 111, 0.18), transparent 32%)',
                }
              : undefined,
        },
        surfaceSx,
        sx,
      )}
    >
      <Container
        maxWidth={false}
        sx={mergeSx(
          {
            position: 'relative',
            zIndex: 1,
            maxWidth,
            px: { xs: 2.5, sm: 3, md: 5 },
            py: dense ? { xs: 4, md: 5 } : { xs: 5, md: 7 },
          },
          containerSx,
        )}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md:
                normalizedGroups.length > 0
                  ? 'minmax(0, 1.15fr) minmax(0, 1.85fr)'
                  : '1fr',
            },
            gap: { xs: 4, md: 6 },
            alignItems: 'start',
          }}
        >
          <Stack spacing={2.5}>
            <FooterBrand
              brandName={brandName}
              tagline={tagline}
              logo={logo}
              logoAlt={logoAlt}
              logoHref={logoHref}
              brandSx={brandSx}
            />

            {actions.length ? (
              <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap">
                {actions.map((action, index) => renderAction(action, index))}
              </Stack>
            ) : null}

            <FooterSocialLinks socialLinks={socialLinks} />
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                lg:
                  normalizedGroups.length > 3
                    ? 'repeat(4, minmax(0, 1fr))'
                    : 'repeat(3, minmax(0, 1fr))',
              },
              gap: { xs: 3, md: 4 },
            }}
          >
            <FooterLinkGroups
              groups={normalizedGroups}
              pathname={pathname}
              linkGroupSx={linkGroupSx}
            />
          </Box>
        </Box>

        {children ? <Box sx={{ mt: { xs: 4, md: 5 } }}>{children}</Box> : null}

        <Divider
          sx={{
            my: dense ? { xs: 3, md: 4 } : { xs: 4, md: 5 },
            borderColor: 'rgba(255, 255, 255, 0.12)',
          }}
        />

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
          sx={bottomSx}
        >
          <Typography
            sx={{
              color: 'rgba(205, 222, 241, 0.76)',
              fontSize: '0.88rem',
              lineHeight: 1.6,
            }}
          >
            {resolvedCopyright}
          </Typography>

          <Stack
            direction="row"
            spacing={1.5}
            useFlexGap
            flexWrap="wrap"
            alignItems="center"
          >
            {versionLabel ? (
              <MuiLink
                href={releaseHref}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: '#8be9ff',
                  fontSize: '0.86rem',
                  fontWeight: 800,
                  lineHeight: 1.4,
                  textDecoration: 'none',
                  textShadow:
                    '0 0 6px rgba(139, 233, 255, 0.72), 0 0 12px rgba(246, 6, 111, 0.24)',

                  '&:hover': {
                    color: '#ffffff',
                    textDecoration: 'underline',
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
                    color: 'rgba(205, 222, 241, 0.76)',
                    fontSize: '0.86rem',
                  },
                )}
              </React.Fragment>
            ))}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

export default Footer;
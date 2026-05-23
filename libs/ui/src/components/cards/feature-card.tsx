// libs/ui/src/components/cards/feature-card.tsx

'use client';

import * as React from 'react';
import type {
  HTMLAttributeAnchorTarget,
} from 'react';

import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MuiCard from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import NextLink from 'next/link';
import type { FeatureCardAlign, FeatureCardProps, FeatureCardTone, FeatureCardVariant } from '../../types'
import { mergeSx } from '../../utils';


function isInternalHref(href: string): boolean {
  return (
    href.startsWith('/') ||
    href.startsWith('#') ||
    href.startsWith('?') ||
    href.startsWith('./') ||
    href.startsWith('../')
  );
}

function getAutoRel(
  href: string | undefined,
  target: HTMLAttributeAnchorTarget | undefined,
  rel: string | undefined,
): string | undefined {
  if (rel) {
    return rel;
  }

  if (href && target === '_blank') {
    return 'noopener noreferrer';
  }

  return undefined;
}

function getToneColor(theme: Theme, tone: FeatureCardTone): string {
  switch (tone) {
    case 'primary':
      return theme.palette.primary.main;

    case 'secondary':
      return theme.palette.secondary.main;

    case 'success':
      return theme.palette.success.main;

    case 'warning':
      return theme.palette.warning.main;

    case 'error':
      return theme.palette.error.main;

    case 'default':
    default:
      return theme.palette.secondary.main;
  }
}

function getJustifyItems(align: FeatureCardAlign): string {
  if (align === 'center') {
    return 'center';
  }

  if (align === 'right') {
    return 'flex-end';
  }

  return 'flex-start';
}

export function FeatureCard({
  eyebrow,
  title,
  description,
  icon,
  badge,
  media,
  children,

  href,
  target,
  rel,
  actionLabel = 'Learn more',
  onClick,

  tone = 'default',
  variant = 'glass',
  align = 'left',

  disabled = false,
  compact = false,
  fullHeight = true,
  hoverable = true,
  showArrow = true,

  sx,
  rootSx,
  actionAreaSx,
  contentSx,
  iconSx,
  mediaSx,
  actionSx,
}: FeatureCardProps): React.ReactElement {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const toneColor = getToneColor(theme, tone);
  const clickable = Boolean(href || onClick) && !disabled;
  const titleId = React.useId();

  const resolvedTarget =
    target ?? (href && !isInternalHref(href) ? '_blank' : undefined);
  const resolvedRel = getAutoRel(href, resolvedTarget, rel);

  const cardBackground: Record<FeatureCardVariant, string> = {
    glass: isDark ? alpha('#ffffff', 0.055) : alpha('#ffffff', 0.72),
    surface: theme.palette.background.paper,
    outlined: 'transparent',
    plain: 'transparent',
  };

  const cardBorder: Record<FeatureCardVariant, string> = {
    glass: `1px solid ${
      tone === 'default'
        ? alpha('#ffffff', isDark ? 0.13 : 0.5)
        : alpha(toneColor, isDark ? 0.36 : 0.28)
    }`,
    surface: `1px solid ${alpha(theme.palette.divider, isDark ? 0.7 : 1)}`,
    outlined: `1px solid ${alpha(toneColor, isDark ? 0.4 : 0.3)}`,
    plain: '1px solid transparent',
  };

  const cardShadow: Record<FeatureCardVariant, string | undefined> = {
    glass: isDark
      ? `0 24px 72px rgba(0, 0, 0, 0.36), 0 0 24px ${alpha(
          toneColor,
          0.12,
        )}, inset 0 1px 0 rgba(255, 255, 255, 0.08)`
      : `0 24px 72px rgba(15, 23, 42, 0.12), 0 0 24px ${alpha(
          toneColor,
          0.08,
        )}`,
    surface: isDark
      ? '0 18px 54px rgba(0, 0, 0, 0.36)'
      : '0 18px 54px rgba(15, 23, 42, 0.12)',
    outlined: undefined,
    plain: undefined,
  };

  const body = (
    <CardContent
      sx={mergeSx(
        {
          position: 'relative',
          zIndex: 1,
          height: fullHeight ? '100%' : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 1.5 : 2,
          p: compact ? { xs: 2, md: 2.25 } : { xs: 2.5, md: 3 },
          textAlign: align,

          '&:last-child': {
            pb: compact ? { xs: 2, md: 2.25 } : { xs: 2.5, md: 3 },
          },
        },
        contentSx,
      )}
    >
      {media ? (
        <Box
          sx={mergeSx(
            {
              width: '100%',
              overflow: 'hidden',
              borderRadius: 3,
            },
            mediaSx,
          )}
        >
          {media}
        </Box>
      ) : null}

      <Stack
        spacing={compact ? 1 : 1.25}
        sx={{
          alignItems: getJustifyItems(align),
          minWidth: 0,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          sx={{
            width: '100%',
            alignItems: 'center',
            justifyContent:
              align === 'center'
                ? 'center'
                : align === 'right'
                  ? 'flex-end'
                  : 'space-between',
          }}
        >
          {icon ? (
            <Box
              aria-hidden="true"
              sx={mergeSx(
                {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: compact ? 40 : 46,
                  height: compact ? 40 : 46,
                  flexShrink: 0,
                  borderRadius: 2.5,
                  color: toneColor,
                  bgcolor: alpha(toneColor, isDark ? 0.14 : 0.1),
                  border: `1px solid ${alpha(toneColor, 0.28)}`,
                  boxShadow: `0 0 18px ${alpha(toneColor, 0.12)}`,
                },
                iconSx,
              )}
            >
              {icon}
            </Box>
          ) : null}

          {badge ? (
            <Chip
              size="small"
              label={badge}
              sx={{
                ml: icon && align === 'left' ? 'auto' : undefined,
                color: toneColor,
                bgcolor: alpha(toneColor, isDark ? 0.14 : 0.1),
                border: `1px solid ${alpha(toneColor, 0.28)}`,
                fontWeight: 800,
              }}
            />
          ) : null}
        </Stack>

        {eyebrow ? (
          <Typography
            component="p"
            variant="overline"
            sx={{
              color: toneColor,
              fontWeight: 900,
              letterSpacing: '0.14em',
              lineHeight: 1.35,
            }}
          >
            {eyebrow}
          </Typography>
        ) : null}

        <Typography
          id={titleId}
          component="h3"
          variant={compact ? 'h6' : 'h5'}
          sx={{
            color: 'text.primary',
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
          }}
        >
          {title}
        </Typography>

        {description ? (
          <Typography
            component="p"
            variant="body2"
            sx={{
              color: 'text.secondary',
              lineHeight: 1.75,
            }}
          >
            {description}
          </Typography>
        ) : null}
      </Stack>

      {children ? (
        <Box
          sx={{
            color: 'text.secondary',
            lineHeight: 1.7,
          }}
        >
          {children}
        </Box>
      ) : null}

      {(href || onClick) && actionLabel ? (
        <Box
          sx={{
            mt: 'auto',
            pt: compact ? 0.5 : 1,
            display: 'flex',
            justifyContent:
              align === 'center'
                ? 'center'
                : align === 'right'
                  ? 'flex-end'
                  : 'flex-start',
          }}
        >
          <Button
            component="span"
            size={compact ? 'small' : 'medium'}
            endIcon={showArrow ? <ArrowForwardRoundedIcon /> : undefined}
            sx={mergeSx(
              {
                px: 0,
                minWidth: 0,
                color: toneColor,
                fontWeight: 900,
                textTransform: 'none',

                '&:hover': {
                  bgcolor: 'transparent',
                  textDecoration: 'underline',
                },
              },
              actionSx,
            )}
          >
            {actionLabel}
          </Button>
        </Box>
      ) : null}
    </CardContent>
  );

  return (
    <MuiCard
      elevation={0}
      aria-labelledby={titleId}
      data-testid="helix-feature-card"
      sx={mergeSx(
        {
          position: 'relative',
          width: '100%',
          height: fullHeight ? '100%' : undefined,
          overflow: 'hidden',
          borderRadius: 4,
          color: 'text.primary',
          bgcolor: cardBackground[variant],
          border: cardBorder[variant],
          boxShadow: cardShadow[variant],
          backdropFilter:
            variant === 'glass' ? 'blur(18px) saturate(160%)' : undefined,
          WebkitBackdropFilter:
            variant === 'glass' ? 'blur(18px) saturate(160%)' : undefined,
          opacity: disabled ? 0.58 : 1,
          transition:
            'transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease',

          '&::before':
            variant === 'glass'
              ? {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background: `radial-gradient(circle at 16% 0%, ${alpha(
                    '#ffffff',
                    isDark ? 0.12 : 0.62,
                  )}, transparent 34%), radial-gradient(circle at 88% 18%, ${alpha(
                    toneColor,
                    isDark ? 0.18 : 0.12,
                  )}, transparent 34%)`,
                }
              : undefined,

          ...(hoverable && !disabled
            ? {
                '&:hover': {
                  transform: clickable ? 'translateY(-3px)' : 'translateY(-2px)',
                  borderColor: alpha(toneColor, 0.52),
                  boxShadow: isDark
                    ? `0 28px 82px rgba(0, 0, 0, 0.48), 0 0 28px ${alpha(
                        toneColor,
                        0.18,
                      )}`
                    : `0 28px 82px rgba(15, 23, 42, 0.16), 0 0 28px ${alpha(
                        toneColor,
                        0.12,
                      )}`,
                },
              }
            : {}),

          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',

            '&:hover': {
              transform: 'none',
            },
          },
        },
        rootSx,
        sx,
      )}
    >
      {href && !disabled ? (
        <CardActionArea
          component={isInternalHref(href) ? (NextLink as React.ElementType) : 'a'}
          href={href}
          target={resolvedTarget}
          rel={resolvedRel}
          onClick={
            onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined
          }
          sx={mergeSx(
            {
              height: fullHeight ? '100%' : undefined,
              display: 'block',
              color: 'inherit',
              textAlign: 'inherit',
              textDecoration: 'none',

              '&:focus-visible': {
                outline: `3px solid ${alpha(toneColor, 0.55)}`,
                outlineOffset: -3,
              },
            },
            actionAreaSx,
          )}
        >
          {body}
        </CardActionArea>
      ) : onClick && !disabled ? (
        <CardActionArea
          onClick={
            onClick as React.MouseEventHandler<HTMLButtonElement> | undefined
          }
          sx={mergeSx(
            {
              height: fullHeight ? '100%' : undefined,
              display: 'block',
              color: 'inherit',
              textAlign: 'inherit',

              '&:focus-visible': {
                outline: `3px solid ${alpha(toneColor, 0.55)}`,
                outlineOffset: -3,
              },
            },
            actionAreaSx,
          )}
        >
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </MuiCard>
  );
}

export default FeatureCard;
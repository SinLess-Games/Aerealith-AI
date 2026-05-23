'use client';

import * as React from 'react';

import Box from '@mui/material/Box';
import {
  alpha,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material/styles';

import { themes } from '../../theme/constants';
import type {
  GlassCardPadding,
  GlassCardProps,
  GlassCardRadius,
  GlassCardTone,
} from '../../types';
import { mergeSx } from '../../utils';

const paddingMap: Record<GlassCardPadding, SxProps<Theme>> = {
  none: {
    p: 0,
  },
  compact: {
    p: { xs: 2, md: 2.5 },
  },
  normal: {
    p: { xs: 2.5, md: 3 },
  },
  comfortable: {
    p: { xs: 3, md: 4 },
  },
};

const radiusMap: Record<GlassCardRadius, number | string> = {
  none: 0,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
};

function getToneColor(theme: Theme, tone: GlassCardTone): string {
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

/**
 * GlassCard
 *
 * Reusable frosted-glass container for cards, panels, sections, and callouts.
 * Uses Helix theme constants where available and falls back to the active MUI theme.
 */
export function GlassCard({
  children,
  component = 'div',
  sx,
  contentSx,
  tone = 'default',
  padding = 'normal',
  radius = 'lg',
  elevated = true,
  hoverable = true,
  glow = false,
  bordered = true,
  blur = true,
  fullHeight = false,
  highlight = true,
  ariaLabel,
  ariaLabelledby,
  role,
  ...boxProps
}: GlassCardProps): React.ReactElement {
  const muiTheme = useTheme();
  const mode = muiTheme.palette.mode === 'dark' ? 'dark' : 'light';
  const helixPalette = themes[mode];
  const toneColor = getToneColor(muiTheme, tone);

  const borderColor =
    tone === 'default'
      ? helixPalette.border.rgba
      : alpha(toneColor, mode === 'dark' ? 0.42 : 0.32);

  const backgroundColor =
    tone === 'default'
      ? helixPalette.surfaceTransparent.rgba
      : alpha(toneColor, mode === 'dark' ? 0.08 : 0.06);

  const baseShadow =
    mode === 'dark'
      ? '0 24px 56px rgba(0, 0, 0, 0.38)'
      : '0 24px 56px rgba(17, 25, 40, 0.14)';

  const hoverShadow =
    mode === 'dark'
      ? `0 30px 72px rgba(0, 0, 0, 0.48), 0 0 28px ${alpha(
          toneColor,
          0.18,
        )}`
      : `0 30px 72px rgba(17, 25, 40, 0.2), 0 0 28px ${alpha(
          toneColor,
          0.12,
        )}`;

  const glowShadow = `0 0 34px ${alpha(
    toneColor,
    mode === 'dark' ? 0.22 : 0.14,
  )}`;

  const baseSx: SxProps<Theme> = {
    position: 'relative',
    width: '100%',
    height: fullHeight ? '100%' : undefined,
    overflow: 'hidden',
    color: 'text.primary',
    borderRadius: radiusMap[radius],
    border: bordered ? `1px solid ${borderColor}` : '1px solid transparent',
    backgroundColor,
    backgroundImage:
      mode === 'dark'
        ? `linear-gradient(135deg, ${alpha('#ffffff', 0.055)}, ${alpha(
            toneColor,
            0.075,
          )})`
        : `linear-gradient(135deg, ${alpha('#ffffff', 0.72)}, ${alpha(
            toneColor,
            0.065,
          )})`,
    boxShadow: elevated
      ? glow
        ? `${baseShadow}, ${glowShadow}`
        : baseShadow
      : glow
        ? glowShadow
        : 'none',
    backdropFilter: blur ? 'blur(18px) saturate(150%)' : undefined,
    WebkitBackdropFilter: blur ? 'blur(18px) saturate(150%)' : undefined,
    transition:
      'transform 200ms ease, border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease',

    ...(highlight
      ? {
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              mode === 'dark'
                ? `radial-gradient(circle at 18% 0%, ${alpha(
                    '#ffffff',
                    0.14,
                  )}, transparent 34%), radial-gradient(circle at 86% 18%, ${alpha(
                    toneColor,
                    0.18,
                  )}, transparent 32%)`
                : `radial-gradient(circle at 18% 0%, ${alpha(
                    '#ffffff',
                    0.75,
                  )}, transparent 36%), radial-gradient(circle at 86% 18%, ${alpha(
                    toneColor,
                    0.12,
                  )}, transparent 32%)`,
          },
        }
      : {}),

    ...(hoverable
      ? {
          '&:hover': {
            transform: 'translateY(-2px)',
            borderColor:
              tone === 'default'
                ? helixPalette.primary.rgba
                : alpha(toneColor, 0.62),
            boxShadow: elevated
              ? glow
                ? `${hoverShadow}, ${glowShadow}`
                : hoverShadow
              : glow
                ? glowShadow
                : 'none',
          },
        }
      : {}),

    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',

      '&:hover': {
        transform: 'none',
      },
    },
  };

  return (
    <Box
      component={component}
      role={role ?? (ariaLabel || ariaLabelledby ? 'region' : undefined)}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      {...boxProps}
      sx={mergeSx(baseSx, sx)}
    >
      <Box
        sx={mergeSx(
          {
            position: 'relative',
            zIndex: 1,
            height: fullHeight ? '100%' : undefined,
            ...paddingMap[padding],
          },
          contentSx,
        )}
      >
        {children}
      </Box>
    </Box>
  );
}

export default GlassCard;
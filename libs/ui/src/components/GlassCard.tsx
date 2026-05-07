'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { useTheme, type SxProps, type Theme } from '@mui/material/styles';

import { themes } from '../theme/constants.js';

export interface GlassCardProps {
  /** The main content of the card. */
  children: React.ReactNode;

  /** Additional system styling overrides. */
  sx?: SxProps<Theme>;

  /** The root component type, for example: section, article, aside. */
  component?: React.ElementType;

  /** Optional elevation toggle for subtle shadow depth. */
  elevated?: boolean;

  /** Optional accessible label for the region. */
  ariaLabel?: string;
}

function mergeSx(...values: Array<SxProps<Theme> | undefined>): SxProps<Theme> {
  const merged = values.flatMap((value) => {
    if (!value) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  });

  return merged as SxProps<Theme>;
}

/**
 * GlassCard
 *
 * Reusable frosted-glass effect container.
 * Uses Helix theme constants to auto-adapt to dark/light modes.
 */
export function GlassCard({
  children,
  sx,
  component = 'div',
  elevated = true,
  ariaLabel,
}: GlassCardProps) {
  const muiTheme = useTheme();
  const mode = muiTheme.palette.mode === 'dark' ? 'dark' : 'light';
  const palette = themes[mode];

  const baseShadow =
    mode === 'dark'
      ? '0 24px 48px rgba(0, 0, 0, 0.35)'
      : '0 24px 48px rgba(17, 25, 40, 0.15)';

  const hoverShadow =
    mode === 'dark'
      ? '0 28px 60px rgba(0, 0, 0, 0.45)'
      : '0 28px 60px rgba(17, 25, 40, 0.22)';

  const baseSx: SxProps<Theme> = {
    position: 'relative',
    borderRadius: 3,
    p: 3,
    overflow: 'hidden',
    backdropFilter: 'blur(18px) saturate(140%)',
    WebkitBackdropFilter: 'blur(18px) saturate(140%)',
    border: `1px solid ${palette.border.rgba}`,
    backgroundColor: palette.surfaceTransparent.rgba,
    boxShadow: elevated ? baseShadow : 'none',
    transition:
      'box-shadow 200ms ease, transform 200ms ease, border-color 250ms ease',

    '&:hover': {
      boxShadow: elevated ? hoverShadow : 'none',
      transform: 'translateY(-2px)',
      borderColor: palette.primary.rgba,
    },

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
      role="region"
      aria-label={ariaLabel}
      sx={mergeSx(baseSx, sx)}
    >
      {children}
    </Box>
  );
}

export default GlassCard;
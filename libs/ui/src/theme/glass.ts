// libs/ui/src/theme/glass.ts

import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

import type { GlassOptions } from '../types/card';

const DEFAULT_GLASS_OPTIONS = {
  opacity: 0.68,
  blurPx: 18,
  saturatePercent: 180,
  borderRadius: 20,
  borderColor: 'var(--hx-glass-brd)',
  shadow: 'var(--hx-shadow)',
} as const satisfies Required<GlassOptions>;

function clampOpacity(opacity: number): number {
  return Math.min(1, Math.max(0, opacity));
}

function alphaSafe(color: string, opacity: number): string {
  const normalizedOpacity = clampOpacity(opacity);

  if (color.startsWith('var(')) {
    return color;
  }

  try {
    return alpha(color, normalizedOpacity);
  } catch {
    return color;
  }
}

export function glass(
  background = 'var(--hx-glass-bg)',
  options: GlassOptions = {},
): SxProps<Theme> {
  const mergedOptions = {
    ...DEFAULT_GLASS_OPTIONS,
    ...options,
  };

  return {
    position: 'relative',
    overflow: 'hidden',

    backdropFilter: `saturate(${mergedOptions.saturatePercent}%) blur(${mergedOptions.blurPx}px)`,
    WebkitBackdropFilter: `saturate(${mergedOptions.saturatePercent}%) blur(${mergedOptions.blurPx}px)`,

    background: alphaSafe(background, mergedOptions.opacity),
    border: `1px solid ${mergedOptions.borderColor}`,
    boxShadow: mergedOptions.shadow,
    borderRadius: mergedOptions.borderRadius,

    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      zIndex: 0,
      pointerEvents: 'none',
      borderRadius: 'inherit',
      background:
        'linear-gradient(135deg, rgba(247, 244, 255, 0.12), rgba(247, 244, 255, 0.02) 42%, rgba(0, 219, 201, 0.08))',
    },

    '& > *': {
      position: 'relative',
      zIndex: 1,
    },
  };
}

export const glassOnPaper: SxProps<Theme> = {
  ...glass('var(--hx-glass-bg)', {
    opacity: 1,
    blurPx: 18,
    saturatePercent: 180,
    borderRadius: 20,
    borderColor: 'var(--hx-glass-brd)',
    shadow: 'var(--hx-shadow)',
  }),
};

export const glassPanel: SxProps<Theme> = {
  ...glass('var(--hx-surface-transparent)', {
    opacity: 1,
    blurPx: 20,
    saturatePercent: 190,
    borderRadius: 24,
    borderColor: 'var(--hx-glass-brd)',
    shadow: 'var(--hx-shadow-soft)',
  }),

  backgroundImage:
    'linear-gradient(145deg, rgba(247, 244, 255, 0.08), rgba(0, 219, 201, 0.04), rgba(246, 6, 111, 0.04))',
};

export const glassCard: SxProps<Theme> = {
  ...glass('var(--hx-surface-transparent)', {
    opacity: 1,
    blurPx: 16,
    saturatePercent: 175,
    borderRadius: 22,
    borderColor: 'var(--hx-border)',
    shadow: 'var(--hx-shadow-soft)',
  }),

  transition:
    'transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease',

  '&:hover': {
    transform: 'translateY(-2px)',
    borderColor: 'rgba(0, 219, 201, 0.38)',
    boxShadow: 'var(--hx-glow-secondary), var(--hx-shadow)',
  },
};

export const glassPrimary: SxProps<Theme> = {
  ...glass('var(--hx-surface-transparent)', {
    opacity: 1,
    blurPx: 18,
    saturatePercent: 190,
    borderRadius: 24,
    borderColor: 'rgba(246, 6, 111, 0.42)',
    shadow: 'var(--hx-glow-primary), var(--hx-shadow-soft)',
  }),
};

export const glassSecondary: SxProps<Theme> = {
  ...glass('var(--hx-surface-transparent)', {
    opacity: 1,
    blurPx: 18,
    saturatePercent: 190,
    borderRadius: 24,
    borderColor: 'rgba(0, 219, 201, 0.38)',
    shadow: 'var(--hx-glow-secondary), var(--hx-shadow-soft)',
  }),
};

export const glassViolet: SxProps<Theme> = {
  ...glass('var(--hx-surface-transparent)', {
    opacity: 1,
    blurPx: 18,
    saturatePercent: 190,
    borderRadius: 24,
    borderColor: 'rgba(140, 82, 255, 0.38)',
    shadow: 'var(--hx-glow-violet), var(--hx-shadow-soft)',
  }),
};
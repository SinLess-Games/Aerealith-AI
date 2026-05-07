// libs/ui/src/theme/glass.ts

import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

export type GlassOptions = {
  opacity?: number;
  blurPx?: number;
  saturatePercent?: number;
  borderRadius?: number | string;
  borderColor?: string;
  shadow?: string;
};

const DEFAULT_GLASS_OPTIONS = {
  opacity: 0.6,
  blurPx: 12,
  saturatePercent: 160,
  borderRadius: 16,
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
  background: string,
  options: GlassOptions = {},
): SxProps<Theme> {
  const mergedOptions = {
    ...DEFAULT_GLASS_OPTIONS,
    ...options,
  };

  return {
    backdropFilter: `saturate(${mergedOptions.saturatePercent}%) blur(${mergedOptions.blurPx}px)`,
    WebkitBackdropFilter: `saturate(${mergedOptions.saturatePercent}%) blur(${mergedOptions.blurPx}px)`,
    background: alphaSafe(background, mergedOptions.opacity),
    border: `1px solid ${mergedOptions.borderColor}`,
    boxShadow: mergedOptions.shadow,
    borderRadius: mergedOptions.borderRadius,
  };
}

export const glassOnPaper: SxProps<Theme> = {
  backdropFilter: 'saturate(160%) blur(10px)',
  WebkitBackdropFilter: 'saturate(160%) blur(10px)',
  background: 'var(--hx-glass-bg)',
  border: '1px solid var(--hx-glass-brd)',
  boxShadow: 'var(--hx-shadow)',
  borderRadius: 16,
};

export const glassPanel: SxProps<Theme> = {
  ...glassOnPaper,
  backgroundColor: 'var(--hx-surface-transparent)',
};

export const glassCard: SxProps<Theme> = {
  ...glassOnPaper,
  borderColor: 'var(--hx-border)',
};
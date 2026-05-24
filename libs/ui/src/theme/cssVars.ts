// libs/ui/src/theme/cssVars.ts

import { AEREALITH_PALETTE, themes } from './constants';
import type { ThemeMode, ThemePalette } from '../types';

export type CssVarMap = Record<`--hx-${string}`, string>;

const DEFAULT_MODE: ThemeMode = 'dark';

function resolveMode(mode: ThemeMode | string | null | undefined): ThemeMode {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }

  return DEFAULT_MODE;
}

function createCssVars(theme: ThemePalette, mode: ThemeMode): CssVarMap {
  const isDark = mode === 'dark';

  return {
    '--hx-bg': theme.background.hex,
    '--hx-bg-rgb': theme.background.rgb,
    '--hx-bg-transparent': theme.backgroundTransparent.rgba,

    '--hx-surface': theme.surface.hex,
    '--hx-surface-rgb': theme.surface.rgb,
    '--hx-surface-transparent': theme.surfaceTransparent.rgba,

    '--hx-border': theme.border.hex,
    '--hx-border-rgb': theme.border.rgb,

    '--hx-text': theme.text.hex,
    '--hx-text-rgb': theme.text.rgb,
    '--hx-text-2': theme.textSecondary.hex,
    '--hx-text-2-rgb': theme.textSecondary.rgb,

    '--hx-primary': theme.primary.hex,
    '--hx-primary-rgb': theme.primary.rgb,
    '--hx-primary-foreground': theme.primaryForeground.hex,

    '--hx-secondary': theme.accent.hex,
    '--hx-secondary-rgb': theme.accent.rgb,
    '--hx-secondary-foreground': theme.accentForeground.hex,

    '--hx-accent': theme.accent.hex,
    '--hx-accent-rgb': theme.accent.rgb,
    '--hx-accent-foreground': theme.accentForeground.hex,

    '--hx-aerealith-pink': AEREALITH_PALETTE.pink,
    '--hx-ether-cyan': AEREALITH_PALETTE.etherCyan,
    '--hx-deep-night': AEREALITH_PALETTE.deepNight,
    '--hx-void-navy': AEREALITH_PALETTE.voidNavy,
    '--hx-aurora-violet': AEREALITH_PALETTE.auroraViolet,
    '--hx-soft-starlight': AEREALITH_PALETTE.softStarlight,
    '--hx-mist-gray': AEREALITH_PALETTE.mistGray,

    '--hx-signature': AEREALITH_PALETTE.pink,
    '--hx-intelligence': AEREALITH_PALETTE.etherCyan,
    '--hx-creativity': AEREALITH_PALETTE.auroraViolet,
    '--hx-depth': AEREALITH_PALETTE.deepNight,
    '--hx-neutral': AEREALITH_PALETTE.mistGray,

    '--hx-glass-bg': theme.surfaceTransparent.rgba,
    '--hx-glass-brd': theme.border.rgba,
    '--hx-glass-highlight': isDark ? 'rgba(247, 244, 255, 0.08)' : 'rgba(255, 255, 255, 0.72)',

    '--hx-glow-primary': isDark
      ? '0 0 32px rgba(246, 6, 111, 0.42)'
      : '0 0 28px rgba(246, 6, 111, 0.24)',
    '--hx-glow-secondary': isDark
      ? '0 0 34px rgba(0, 219, 201, 0.34)'
      : '0 0 28px rgba(0, 219, 201, 0.24)',
    '--hx-glow-violet': isDark
      ? '0 0 34px rgba(140, 82, 255, 0.36)'
      : '0 0 28px rgba(140, 82, 255, 0.22)',

    '--hx-shadow': isDark
      ? '0 20px 60px rgba(0, 0, 0, 0.48)'
      : '0 18px 48px rgba(5, 10, 30, 0.14)',

    '--hx-shadow-soft': isDark
      ? '0 14px 40px rgba(0, 0, 0, 0.32)'
      : '0 12px 34px rgba(5, 10, 30, 0.1)',

    '--hx-gradient-brand':
      'linear-gradient(135deg, #F6066F 0%, #8C52FF 48%, #00DBC9 100%)',
    '--hx-gradient-surface': isDark
      ? 'linear-gradient(145deg, rgba(8, 7, 27, 0.94) 0%, rgba(5, 10, 30, 0.92) 100%)'
      : 'linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(247, 244, 255, 0.86) 100%)',
    '--hx-gradient-page': isDark
      ? 'radial-gradient(circle at top left, rgba(246, 6, 111, 0.18), transparent 34%), radial-gradient(circle at top right, rgba(0, 219, 201, 0.14), transparent 32%), radial-gradient(circle at bottom center, rgba(140, 82, 255, 0.16), transparent 42%), #050A1E'
      : 'radial-gradient(circle at top left, rgba(246, 6, 111, 0.1), transparent 34%), radial-gradient(circle at top right, rgba(0, 219, 201, 0.12), transparent 32%), radial-gradient(circle at bottom center, rgba(140, 82, 255, 0.12), transparent 42%), #F7F4FF',
  };
}

export function getCssVars(mode: ThemeMode | string = DEFAULT_MODE): CssVarMap {
  const resolvedMode = resolveMode(mode);

  return createCssVars(themes[resolvedMode], resolvedMode);
}

export function applyCssVars(mode: ThemeMode | string = DEFAULT_MODE): void {
  if (typeof document === 'undefined') {
    return;
  }

  const resolvedMode = resolveMode(mode);
  const root = document.documentElement;
  const vars = getCssVars(resolvedMode);

  root.dataset.theme = resolvedMode;
  root.style.colorScheme = resolvedMode;

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
}

export function cssVarsToString(mode: ThemeMode | string = DEFAULT_MODE): string {
  const vars = getCssVars(mode);

  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n');
}
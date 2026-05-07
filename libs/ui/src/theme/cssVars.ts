// libs/ui/src/theme/cssVars.ts

import { themes, type Mode, type ThemePalette } from './constants';

export type CssVarMap = Record<`--hx-${string}`, string>;

const DEFAULT_MODE: Mode = 'dark';

function resolveMode(mode: Mode | string | null | undefined): Mode {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }

  return DEFAULT_MODE;
}

function createCssVars(theme: ThemePalette): CssVarMap {
  return {
    '--hx-bg': theme.background.hex,
    '--hx-bg-transparent': theme.backgroundTransparent.rgba,

    '--hx-surface': theme.surface.hex,
    '--hx-surface-transparent': theme.surfaceTransparent.rgba,

    '--hx-border': theme.border.hex,

    '--hx-text': theme.text.hex,
    '--hx-text-2': theme.textSecondary.hex,

    '--hx-primary': theme.primary.hex,
    '--hx-primary-rgb': theme.primary.rgb,
    '--hx-primary-foreground': theme.primaryForeground.hex,

    '--hx-secondary': theme.accent.hex,
    '--hx-secondary-rgb': theme.accent.rgb,
    '--hx-secondary-foreground': theme.accentForeground.hex,

    '--hx-accent': theme.accent.hex,
    '--hx-accent-rgb': theme.accent.rgb,
    '--hx-accent-foreground': theme.accentForeground.hex,

    '--hx-glass-bg': theme.surfaceTransparent.rgba,
    '--hx-glass-brd': theme.border.rgba,
    '--hx-shadow': '0 10px 30px rgba(0, 0, 0, 0.25)',
  };
}

export function getCssVars(mode: Mode | string = DEFAULT_MODE): CssVarMap {
  const resolvedMode = resolveMode(mode);
  return createCssVars(themes[resolvedMode]);
}

export function applyCssVars(mode: Mode | string = DEFAULT_MODE): void {
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

export function cssVarsToString(mode: Mode | string = DEFAULT_MODE): string {
  const vars = getCssVars(mode);

  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n');
}
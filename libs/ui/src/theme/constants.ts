// libs/ui/src/theme/constants.ts

import type { ColorFormats, ThemeMode, ThemePalette } from '../types';

const HEX_COLOR_PATTERN = /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/;

const clampAlpha = (alpha: number): number => Math.min(1, Math.max(0, alpha));

const normalizeHex = (hex: string): string => {
  const stripped = hex.trim().replace(/^#/, '');

  if (!HEX_COLOR_PATTERN.test(stripped)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }

  if (stripped.length === 3) {
    return stripped
      .split('')
      .map((character) => `${character}${character}`)
      .join('')
      .toUpperCase();
  }

  return stripped.toUpperCase();
};

const hexToRgb = (hex: string): [number, number, number] => {
  const normalizedHex = normalizeHex(hex);
  const numericValue = Number.parseInt(normalizedHex, 16);

  return [
    (numericValue >> 16) & 255,
    (numericValue >> 8) & 255,
    numericValue & 255,
  ];
};

const alphaToHex = (alpha: number): string =>
  Math.round(clampAlpha(alpha) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

const createColor = (hex: string, alpha = 1): ColorFormats => {
  const normalizedAlpha = clampAlpha(alpha);
  const normalizedHex = normalizeHex(hex);
  const [red, green, blue] = hexToRgb(normalizedHex);
  const baseHex = `#${normalizedHex}`;

  return {
    hex: normalizedAlpha >= 1 ? baseHex : `${baseHex}${alphaToHex(normalizedAlpha)}`,
    rgb: `rgb(${red}, ${green}, ${blue})`,
    rgba: `rgba(${red}, ${green}, ${blue}, ${Number(normalizedAlpha.toFixed(3))})`,
  };
};

export const AEREALITH_PALETTE = {
  pink: '#F6066F',
  etherCyan: '#00DBC9',
  deepNight: '#050A1E',
  voidNavy: '#08071B',
  auroraViolet: '#8C52FF',
  softStarlight: '#F7F4FF',
  mistGray: '#AEB7C8',
} as const;

export const lightTheme: ThemePalette = {
  primary: createColor(AEREALITH_PALETTE.pink),
  primaryForeground: createColor(AEREALITH_PALETTE.softStarlight),

  background: createColor(AEREALITH_PALETTE.softStarlight),
  backgroundTransparent: createColor(AEREALITH_PALETTE.softStarlight, 0.76),

  surface: createColor('#FFFFFF'),
  surfaceTransparent: createColor('#FFFFFF', 0.82),

  border: createColor(AEREALITH_PALETTE.mistGray, 0.56),

  text: createColor(AEREALITH_PALETTE.deepNight),
  textSecondary: createColor('#4D566B'),

  accent: createColor(AEREALITH_PALETTE.etherCyan),
  accentForeground: createColor(AEREALITH_PALETTE.deepNight),
};

export const darkTheme: ThemePalette = {
  primary: createColor(AEREALITH_PALETTE.pink),
  primaryForeground: createColor(AEREALITH_PALETTE.softStarlight),

  background: createColor(AEREALITH_PALETTE.deepNight),
  backgroundTransparent: createColor(AEREALITH_PALETTE.deepNight, 0.78),

  surface: createColor(AEREALITH_PALETTE.voidNavy),
  surfaceTransparent: createColor(AEREALITH_PALETTE.voidNavy, 0.74),

  border: createColor(AEREALITH_PALETTE.mistGray, 0.22),

  text: createColor(AEREALITH_PALETTE.softStarlight),
  textSecondary: createColor(AEREALITH_PALETTE.mistGray),

  accent: createColor(AEREALITH_PALETTE.etherCyan),
  accentForeground: createColor(AEREALITH_PALETTE.deepNight),
};

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const satisfies Record<ThemeMode, ThemePalette>;

export const AEREALITH_COLORS = {
  palette: AEREALITH_PALETTE,

  light: {
    primary: lightTheme.primary.hex,
    secondary: lightTheme.accent.hex,
    background: lightTheme.background.hex,
    surface: lightTheme.surface.hex,
    border: lightTheme.border.hex,
    textPrimary: lightTheme.text.hex,
    textSecondary: lightTheme.textSecondary.hex,

    signature: AEREALITH_PALETTE.pink,
    intelligence: AEREALITH_PALETTE.etherCyan,
    creativity: AEREALITH_PALETTE.auroraViolet,
    depth: AEREALITH_PALETTE.deepNight,
    neutral: AEREALITH_PALETTE.mistGray,
  },

  dark: {
    primary: darkTheme.primary.hex,
    secondary: darkTheme.accent.hex,
    background: darkTheme.background.hex,
    surface: darkTheme.surface.hex,
    border: darkTheme.border.hex,
    textPrimary: darkTheme.text.hex,
    textSecondary: darkTheme.textSecondary.hex,

    signature: AEREALITH_PALETTE.pink,
    intelligence: AEREALITH_PALETTE.etherCyan,
    creativity: AEREALITH_PALETTE.auroraViolet,
    depth: AEREALITH_PALETTE.deepNight,
    neutral: AEREALITH_PALETTE.mistGray,
  },
} as const;

/**
 * Backward-compatible export.
 *
 * Keep this alias until the app has fully migrated away from Helix naming.
 */
export const HELIX_COLORS = AEREALITH_COLORS;

export const AerealithFonts = {
  DISPLAY:
    'var(--font-orbitron, var(--font-space-grotesk, "Orbitron", "Space Grotesk", sans-serif))',
  BODY: 'var(--font-inter, "Inter", sans-serif)',
  MONO: 'var(--font-jetbrains-mono, "JetBrains Mono", "Fira Code", monospace)',

  LORA: 'var(--font-lora, "Lora", serif)',
  PINYON: 'var(--font-pinyon, "Pinyon Script", cursive)',
  INTER: 'var(--font-inter, "Inter", sans-serif)',
} as const;

/**
 * Backward-compatible export.
 *
 * Keep this alias until existing imports are renamed.
 */
export const HelixFonts = AerealithFonts;
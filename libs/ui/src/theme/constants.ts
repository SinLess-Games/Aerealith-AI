// libs/ui/src/theme/constants.ts

export type ColorFormats = {
  hex: string;
  rgb: string;
  rgba: string;
};

export type ThemePalette = {
  primary: ColorFormats;
  primaryForeground: ColorFormats;
  background: ColorFormats;
  backgroundTransparent: ColorFormats;
  surface: ColorFormats;
  surfaceTransparent: ColorFormats;
  border: ColorFormats;
  text: ColorFormats;
  textSecondary: ColorFormats;
  accent: ColorFormats;
  accentForeground: ColorFormats;
};

export type ThemeMode = 'light' | 'dark';
export type Mode = ThemeMode;

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

export const lightTheme: ThemePalette = {
  primary: createColor('#6200EE'),
  primaryForeground: createColor('#FFFFFF'),
  background: createColor('#F5F7FC'),
  backgroundTransparent: createColor('#F5F7FC', 0.72),
  surface: createColor('#FFFFFF'),
  surfaceTransparent: createColor('#FFFFFF', 0.78),
  border: createColor('#D6DBE6'),
  text: createColor('#121826'),
  textSecondary: createColor('#5C6982'),
  accent: createColor('#00BCD4'),
  accentForeground: createColor('#082B38'),
};

export const darkTheme: ThemePalette = {
  primary: createColor('#8C52FF'),
  primaryForeground: createColor('#130D29'),
  background: createColor('#070A11'),
  backgroundTransparent: createColor('#070A11', 0.72),
  surface: createColor('#181A22'),
  surfaceTransparent: createColor('#181A22', 0.7),
  border: createColor('#383D4F'),
  text: createColor('#E5E8F0'),
  textSecondary: createColor('#A4AABE'),
  accent: createColor('#00BFA6'),
  accentForeground: createColor('#052421'),
};

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const satisfies Record<ThemeMode, ThemePalette>;

export const HELIX_COLORS = {
  light: {
    primary: lightTheme.primary.hex,
    secondary: lightTheme.accent.hex,
    background: lightTheme.background.hex,
    surface: lightTheme.surface.hex,
    textPrimary: lightTheme.text.hex,
    textSecondary: lightTheme.textSecondary.hex,
  },
  dark: {
    primary: darkTheme.primary.hex,
    secondary: darkTheme.accent.hex,
    background: darkTheme.background.hex,
    surface: darkTheme.surface.hex,
    textPrimary: darkTheme.text.hex,
    textSecondary: darkTheme.textSecondary.hex,
  },
} as const;

export const HelixFonts = {
  LORA: 'var(--font-lora, "Lora", serif)',
  PINYON: 'var(--font-pinyon, "Pinyon Script", cursive)',
  INTER: 'var(--font-inter, "Inter", sans-serif)',
} as const;
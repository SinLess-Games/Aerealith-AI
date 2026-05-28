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

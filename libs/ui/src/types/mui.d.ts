export type MuiBreakpointsWithProductionKeys = Theme['breakpoints'] & {
  internal_mediaKeys?: Theme['breakpoints']['keys'];
};

export type ModeColorTokens = {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  signature: string;
  intelligence: string;
  creativity: string;
  depth: string;
  neutral: string;
};

export type ThemeFontTokens = typeof HelixFonts &
  Partial<Record<'DISPLAY' | 'BODY' | 'MONO', string>>;

type MuiBreakpointsWithProductionKeys = Theme['breakpoints'] & {
  internal_mediaKeys?: Theme['breakpoints']['keys'];
};


export type ThemeProviderDefaultMode = 'system' | Mode;

export type ThemeProviderProps = {
  defaultMode?: ThemeProviderDefaultMode;
  children: React.ReactNode;
};

export type ColorModeContextValue = {
  mode: Mode;
  defaultMode: ThemeProviderDefaultMode;
  setMode: (mode: Mode) => void;
  toggle: () => void;
};
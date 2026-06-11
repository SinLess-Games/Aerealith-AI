// libs/ui/src/types/mui.ts

import type { ReactNode } from 'react';

import type { Theme } from '@mui/material/styles';

export type Mode = 'light' | 'dark';

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

export type ThemeFontTokens = Partial<
  Record<'DISPLAY' | 'BODY' | 'MONO' | 'display' | 'body' | 'mono', string>
> &
  Record<string, string | undefined>;

export type ThemeProviderDefaultMode = 'system' | Mode;

export type ThemeProviderProps = {
  defaultMode?: ThemeProviderDefaultMode;
  children: ReactNode;
};

export type ColorModeContextValue = {
  mode: Mode;
  defaultMode: ThemeProviderDefaultMode;
  setMode: (mode: Mode) => void;
  toggle: () => void;
};

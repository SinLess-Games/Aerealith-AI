'use client';

import * as React from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';

import { applyCssVars } from '../theme/cssVars';
import type { Mode } from '../theme/constants';
import { getMuiTheme } from '../theme/mui';

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

export const ColorModeContext =
  React.createContext<ColorModeContextValue | null>(null);

function isMode(value: unknown): value is Mode {
  return value === 'light' || value === 'dark';
}

function getSystemMode(): Mode {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }

  return 'light';
}

function getDocumentMode(): Mode | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const theme = document.documentElement.dataset.theme;

  return isMode(theme) ? theme : null;
}

function getInitialMode(defaultMode: ThemeProviderDefaultMode): Mode {
  if (defaultMode !== 'system') {
    return defaultMode;
  }

  return getDocumentMode() ?? getSystemMode();
}

function applyThemeMode(mode: Mode): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  root.classList.toggle('dark', mode === 'dark');
  root.dataset.theme = mode;

  applyCssVars(mode);
}

export function ThemeProvider({
  defaultMode = 'system',
  children,
}: ThemeProviderProps) {
  const [mode, setModeState] = React.useState<Mode>(() =>
    getInitialMode(defaultMode),
  );

  const setMode = React.useCallback((nextMode: Mode): void => {
    setModeState(nextMode);
  }, []);

  const toggle = React.useCallback((): void => {
    setModeState((currentMode) => (currentMode === 'dark' ? 'light' : 'dark'));
  }, []);

  React.useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  React.useEffect(() => {
    if (defaultMode !== 'system') {
      return undefined;
    }

    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemModeChange = (): void => {
      setModeState(mediaQuery.matches ? 'dark' : 'light');
    };

    handleSystemModeChange();

    mediaQuery.addEventListener?.('change', handleSystemModeChange);

    return () => {
      mediaQuery.removeEventListener?.('change', handleSystemModeChange);
    };
  }, [defaultMode]);

  const contextValue = React.useMemo<ColorModeContextValue>(
    () => ({
      mode,
      defaultMode,
      setMode,
      toggle,
    }),
    [defaultMode, mode, setMode, toggle],
  );

  const muiTheme = React.useMemo(() => getMuiTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useHelixColorMode(): ColorModeContextValue {
  const context = React.useContext(ColorModeContext);

  if (!context) {
    throw new Error('useHelixColorMode must be used within ThemeProvider.');
  }

  return context;
}

export default ThemeProvider;
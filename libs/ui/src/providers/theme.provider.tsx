// libs/ui/src/providers/theme.provider.tsx

'use client';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import * as React from 'react';

import { applyCssVars } from '../theme/cssVars';
import { getMuiTheme } from '../theme/mui';
import type {
  ColorModeContextValue,
  Mode as ThemeMode,
  ThemeProviderDefaultMode,
  ThemeProviderProps,
} from '../types';

export type { ThemeProviderDefaultMode } from '../types';

const DEFAULT_MODE: ThemeMode = 'dark';
const STORAGE_KEY = 'hx-theme-mode';

export const ColorModeContext =
  React.createContext<ColorModeContextValue | null>(null);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function canUseDOM(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getStoredMode(): ThemeMode | null {
  if (!canUseDOM()) {
    return null;
  }

  try {
    const storedMode = window.localStorage.getItem(STORAGE_KEY);

    return isThemeMode(storedMode) ? storedMode : null;
  } catch {
    return null;
  }
}

function setStoredMode(mode: ThemeMode): void {
  if (!canUseDOM()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures, such as private browsing restrictions.
  }
}

function getDocumentMode(): ThemeMode | null {
  if (!canUseDOM()) {
    return null;
  }

  const theme = document.documentElement.dataset.theme;

  return isThemeMode(theme) ? theme : null;
}

function getSystemMode(): ThemeMode {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return DEFAULT_MODE;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getInitialMode(defaultMode: ThemeProviderDefaultMode): ThemeMode {
  const storedMode = getStoredMode();

  if (storedMode) {
    return storedMode;
  }

  const documentMode = getDocumentMode();

  if (documentMode) {
    return documentMode;
  }

  if (defaultMode === 'system') {
    return getSystemMode();
  }

  return defaultMode;
}

function applyThemeMode(mode: ThemeMode): void {
  if (!canUseDOM()) {
    return;
  }

  const root = document.documentElement;

  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');

  root.dataset.theme = mode;
  root.style.colorScheme = mode;

  applyCssVars(mode);
}

export function ThemeProvider({
  defaultMode = 'system',
  children,
}: ThemeProviderProps) {
  const [mode, setModeState] = React.useState<ThemeMode>(() =>
    getInitialMode(defaultMode),
  );

  const setMode = React.useCallback((nextMode: ThemeMode): void => {
    setModeState(nextMode);
    setStoredMode(nextMode);
  }, []);

  const toggle = React.useCallback((): void => {
    setModeState((currentMode) => {
      const nextMode = currentMode === 'dark' ? 'light' : 'dark';

      setStoredMode(nextMode);

      return nextMode;
    });
  }, []);

  React.useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  React.useEffect(() => {
    if (defaultMode !== 'system' || getStoredMode()) {
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

/**
 * Aerealith-facing alias.
 *
 * Keep `useHelixColorMode` for backward compatibility while new code migrates.
 */
export function useAerealithColorMode(): ColorModeContextValue {
  return useHelixColorMode();
}

export default ThemeProvider;

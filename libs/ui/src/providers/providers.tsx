'use client';

import type { ReactNode } from 'react';

import AppRouterCacheProvider, {
  type AppRouterCacheProviderProps,
} from './approuter-cache.provider';
import FaroProvider, { type FaroProviderProps } from './faro.provider';
import ThemeProvider, {
  type ThemeProviderDefaultMode,
} from './theme.provider';
import ToastProvider, { type ToastProviderProps } from './toast.provider';

export type HelixProvidersProps = {
  /**
   * "system" uses prefers-color-scheme.
   * Otherwise force light or dark mode.
   */
  defaultMode?: ThemeProviderDefaultMode;

  /**
   * Optional MUI App Router cache provider configuration.
   */
  appRouterCache?: Omit<AppRouterCacheProviderProps, 'children'>;

  /**
   * Optional Faro provider configuration.
   */
  faro?: Omit<FaroProviderProps, 'children'>;

  /**
   * Optional app-wide toast provider configuration.
   */
  toast?: Omit<ToastProviderProps, 'children'>;

  children: ReactNode;
};

export function HelixProviders({
  children,
  defaultMode = 'system',
  appRouterCache,
  faro,
  toast,
}: HelixProvidersProps) {
  return (
    <AppRouterCacheProvider options={appRouterCache?.options}>
      <ThemeProvider defaultMode={defaultMode}>
        <FaroProvider enabled={faro?.enabled} config={faro?.config}>
          <ToastProvider
            anchorOrigin={toast?.anchorOrigin}
            autoHideDuration={toast?.autoHideDuration}
            maxQueued={toast?.maxQueued}
            closeLabel={toast?.closeLabel}
            ignoreClickaway={toast?.ignoreClickaway}
            alertVariant={toast?.alertVariant}
            snackbarProps={toast?.snackbarProps}
            alertSx={toast?.alertSx}
          >
            {children}
          </ToastProvider>
        </FaroProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}

export default HelixProviders;
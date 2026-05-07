'use client';

import type { ReactNode } from 'react';

import FaroProvider, { type FaroProviderProps } from './faro.provider.js';
import ThemeProvider, {
  type ThemeProviderDefaultMode,
} from './theme.provider.js';

export type HelixProvidersProps = {
  /**
   * "system" uses prefers-color-scheme.
   * Otherwise force light or dark mode.
   */
  defaultMode?: ThemeProviderDefaultMode;

  /**
   * Optional Faro provider configuration.
   */
  faro?: Omit<FaroProviderProps, 'children'>;

  children: ReactNode;
};

export function HelixProviders({
  children,
  defaultMode = 'system',
  faro,
}: HelixProvidersProps) {
  return (
    <ThemeProvider defaultMode={defaultMode}>
      <FaroProvider enabled={faro?.enabled} config={faro?.config}>
        {children}
      </FaroProvider>
    </ThemeProvider>
  );
}

export default HelixProviders;
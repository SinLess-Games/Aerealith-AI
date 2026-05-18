// libs/ui/src/providers/approuter-cache.provider.tsx

import * as React from 'react';
import { AppRouterCacheProvider as MuiAppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';

export type AppRouterCacheProviderProps = {
  children: React.ReactNode;
  options?: React.ComponentProps<typeof MuiAppRouterCacheProvider>['options'];
};

const defaultOptions: NonNullable<AppRouterCacheProviderProps['options']> = {
  key: 'mui',
  enableCssLayer: true,
};

export function AppRouterCacheProvider({
  children,
  options = defaultOptions,
}: AppRouterCacheProviderProps): React.ReactElement {
  return (
    <MuiAppRouterCacheProvider options={options}>
      {children}
    </MuiAppRouterCacheProvider>
  );
}

export default AppRouterCacheProvider;
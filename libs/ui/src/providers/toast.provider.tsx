// libs/ui/src/providers/toast.provider.tsx

'use client';

import * as React from 'react';

import {
  ToastProvider as PrimitiveToastProvider,
  type ToastProviderProps as PrimitiveToastProviderProps,
} from '../components/primitives/toast';

export interface ToastProviderProps extends PrimitiveToastProviderProps {
  /**
   * App-wide toast provider wrapper.
   *
   * This exists so apps can import providers from `@aerealith-ai/ui/providers`
   * without reaching into component primitives directly.
   */
  children: React.ReactNode;
}

export function ToastProvider({
  children,
  anchorOrigin = {
    vertical: 'bottom',
    horizontal: 'right',
  },
  autoHideDuration = 6000,
  maxQueued = 8,
  closeLabel = 'Close notification',
  ignoreClickaway = true,
  alertVariant = 'filled',
  snackbarProps,
  alertSx,
}: ToastProviderProps): React.ReactElement {
  return (
    <PrimitiveToastProvider
      anchorOrigin={anchorOrigin}
      autoHideDuration={autoHideDuration}
      maxQueued={maxQueued}
      closeLabel={closeLabel}
      ignoreClickaway={ignoreClickaway}
      alertVariant={alertVariant}
      snackbarProps={snackbarProps}
      alertSx={alertSx}
    >
      {children}
    </PrimitiveToastProvider>
  );
}

export default ToastProvider;
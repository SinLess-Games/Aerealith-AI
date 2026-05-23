// libs/ui/src/components/toasts/warning.toast.tsx

'use client';

import * as React from 'react';

import Toast from '../primitives/toast';
import type {
  ToastAction,
  ToastId,
  ToastMessage,
  ToastProps,
} from '../primitives/toast';

export interface WarningToastProps
  extends Omit<ToastProps, 'toast' | 'title' | 'action'> {
  id?: ToastId;
  title?: React.ReactNode;
  message: React.ReactNode;
  action?: ToastAction;
  persist?: boolean;

  /**
   * Auto-hide duration for this toast message.
   *
   * Use `null` to disable auto-hide for this specific warning.
   */
  toastAutoHideDuration?: number | null;

  alertProps?: ToastMessage['alertProps'];
}

export function buildWarningToastMessage({
  id = 'helix-warning-toast',
  title,
  message,
  action,
  persist,
  toastAutoHideDuration,
  alertProps,
}: Pick<
  WarningToastProps,
  | 'id'
  | 'title'
  | 'message'
  | 'action'
  | 'persist'
  | 'toastAutoHideDuration'
  | 'alertProps'
>): ToastMessage {
  return {
    id,
    title,
    message,
    severity: 'warning',
    action,
    persist,
    autoHideDuration: toastAutoHideDuration,
    alertProps,
  };
}

export function WarningToast({
  id = 'helix-warning-toast',
  title = 'Warning',
  message,
  action,
  persist,
  toastAutoHideDuration,
  alertProps,
  alertVariant = 'filled',
  ...toastProps
}: WarningToastProps): React.ReactElement {
  return (
    <Toast
      {...toastProps}
      alertVariant={alertVariant}
      toast={buildWarningToastMessage({
        id,
        title,
        message,
        action,
        persist,
        toastAutoHideDuration,
        alertProps,
      })}
    />
  );
}

export default WarningToast;
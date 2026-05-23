// libs/ui/src/components/toasts/error.toast.tsx

'use client';

import * as React from 'react';

import Toast from '../primitives/toast';
import type {
  ToastAction,
  ToastId,
  ToastMessage,
  ToastProps,
} from '../primitives/toast';

export interface ErrorToastProps
  extends Omit<ToastProps, 'toast' | 'title' | 'action'> {
  id?: ToastId;
  title?: React.ReactNode;
  message: React.ReactNode;
  action?: ToastAction;
  persist?: boolean;

  /**
   * Auto-hide duration for this toast message.
   *
   * Use `null` to disable auto-hide for this specific error.
   */
  toastAutoHideDuration?: number | null;

  alertProps?: ToastMessage['alertProps'];
}

export function buildErrorToastMessage({
  id = 'helix-error-toast',
  title,
  message,
  action,
  persist,
  toastAutoHideDuration,
  alertProps,
}: Pick<
  ErrorToastProps,
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
    severity: 'error',
    action,
    persist,
    autoHideDuration: toastAutoHideDuration,
    alertProps,
  };
}

export function ErrorToast({
  id = 'helix-error-toast',
  title = 'Something went wrong',
  message,
  action,
  persist,
  toastAutoHideDuration,
  alertProps,
  alertVariant = 'filled',
  ...toastProps
}: ErrorToastProps): React.ReactElement {
  return (
    <Toast
      {...toastProps}
      alertVariant={alertVariant}
      toast={buildErrorToastMessage({
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

export default ErrorToast;
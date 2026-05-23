// libs/ui/src/components/toasts/fatal.toast.tsx

'use client';

import * as React from 'react';

import Toast from '../primitives/toast';
import type {
  ToastAction,
  ToastId,
  ToastMessage,
  ToastProps,
} from '../primitives/toast';

export interface FatalToastProps
  extends Omit<ToastProps, 'toast' | 'title' | 'action'> {
  id?: ToastId;
  title?: React.ReactNode;
  message: React.ReactNode;
  action?: ToastAction;

  /**
   * Fatal toasts persist by default.
   *
   * Set this to false only when the fatal message should auto-hide.
   */
  persist?: boolean;

  /**
   * Auto-hide duration for this toast message.
   *
   * This only matters when `persist` is false.
   */
  toastAutoHideDuration?: number | null;

  alertProps?: ToastMessage['alertProps'];
}

export function buildFatalToastMessage({
  id = 'helix-fatal-toast',
  title,
  message,
  action,
  persist = true,
  toastAutoHideDuration,
  alertProps,
}: Pick<
  FatalToastProps,
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
    autoHideDuration: persist ? null : toastAutoHideDuration,
    alertProps,
  };
}

export function FatalToast({
  id = 'helix-fatal-toast',
  title = 'Fatal error',
  message,
  action,
  persist = true,
  toastAutoHideDuration,
  alertProps,
  alertVariant = 'filled',
  ignoreClickaway = true,
  ...toastProps
}: FatalToastProps): React.ReactElement {
  return (
    <Toast
      {...toastProps}
      alertVariant={alertVariant}
      ignoreClickaway={ignoreClickaway}
      toast={buildFatalToastMessage({
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

export default FatalToast;
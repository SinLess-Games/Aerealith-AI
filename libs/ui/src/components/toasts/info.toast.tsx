// libs/ui/src/components/toasts/info.toast.tsx

'use client';

import * as React from 'react';

import Toast from '../primitives/toast';
import type {
  ToastAction,
  ToastId,
  ToastMessage,
  ToastProps,
} from '../primitives/toast';

export interface InfoToastProps
  extends Omit<ToastProps, 'toast' | 'title' | 'action'> {
  id?: ToastId;
  title?: React.ReactNode;
  message: React.ReactNode;
  action?: ToastAction;
  persist?: boolean;

  /**
   * Auto-hide duration for this toast message.
   *
   * Use `null` to disable auto-hide for this specific info toast.
   */
  toastAutoHideDuration?: number | null;

  alertProps?: ToastMessage['alertProps'];
}

export function buildInfoToastMessage({
  id = 'helix-info-toast',
  title,
  message,
  action,
  persist,
  toastAutoHideDuration,
  alertProps,
}: Pick<
  InfoToastProps,
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
    severity: 'info',
    action,
    persist,
    autoHideDuration: toastAutoHideDuration,
    alertProps,
  };
}

export function InfoToast({
  id = 'helix-info-toast',
  title = 'Info',
  message,
  action,
  persist,
  toastAutoHideDuration,
  alertProps,
  alertVariant = 'filled',
  ...toastProps
}: InfoToastProps): React.ReactElement {
  return (
    <Toast
      {...toastProps}
      alertVariant={alertVariant}
      toast={buildInfoToastMessage({
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

export default InfoToast;
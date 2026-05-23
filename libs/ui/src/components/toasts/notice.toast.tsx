// libs/ui/src/components/toasts/notice.toast.ts

'use client';

import * as React from 'react';

import Toast from '../primitives/toast';
import type {
  ToastAction,
  ToastId,
  ToastMessage,
  ToastProps,
  ToastSeverity,
} from '../primitives/toast';

export interface NoticeToastProps
  extends Omit<ToastProps, 'toast' | 'title' | 'action'> {
  id?: ToastId;
  title?: React.ReactNode;
  message: React.ReactNode;
  action?: ToastAction;
  severity?: ToastSeverity;
  persist?: boolean;

  /**
   * Auto-hide duration for this toast message.
   *
   * Use `null` to disable auto-hide for this specific notice.
   */
  toastAutoHideDuration?: number | null;

  alertProps?: ToastMessage['alertProps'];
}

export function buildNoticeToastMessage({
  id = 'helix-notice-toast',
  title,
  message,
  action,
  severity = 'info',
  persist,
  toastAutoHideDuration,
  alertProps,
}: Pick<
  NoticeToastProps,
  | 'id'
  | 'title'
  | 'message'
  | 'action'
  | 'severity'
  | 'persist'
  | 'toastAutoHideDuration'
  | 'alertProps'
>): ToastMessage {
  return {
    id,
    title,
    message,
    severity,
    action,
    persist,
    autoHideDuration: toastAutoHideDuration,
    alertProps,
  };
}

export function NoticeToast({
  id = 'helix-notice-toast',
  title = 'Notice',
  message,
  action,
  severity = 'info',
  persist,
  toastAutoHideDuration,
  alertProps,
  alertVariant = 'filled',
  ...toastProps
}: NoticeToastProps): React.ReactElement {
  return React.createElement(Toast, {
    ...toastProps,
    alertVariant,
    toast: buildNoticeToastMessage({
      id,
      title,
      message,
      action,
      severity,
      persist,
      toastAutoHideDuration,
      alertProps,
    }),
  });
}

export default NoticeToast;
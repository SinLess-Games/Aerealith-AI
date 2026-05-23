// libs/ui/src/components/toasts/index.ts

export {
  ErrorToast,
  buildErrorToastMessage,
} from './error.toast';

export {
  FatalToast,
  buildFatalToastMessage,
} from './fatal.toast';

export {
  WarningToast,
  buildWarningToastMessage,
} from './warning.toast';

export {
  InfoToast,
  buildInfoToastMessage,
} from './info.toast';

export {
  NoticeToast,
  buildNoticeToastMessage,
} from './notice.toast';

export type { ErrorToastProps } from './error.toast';
export type { FatalToastProps } from './fatal.toast';
export type { WarningToastProps } from './warning.toast';
export type { InfoToastProps } from './info.toast';
export type { NoticeToastProps } from './notice.toast';
// libs/ui/src/components/primitives/index.tsx

export {
  PrimitiveModal,
  default as Modal,
} from './modal';

export {
  Toast,
  ToastProvider,
  useToast,
} from './toast';

export type {
  PrimitiveModalActionsAlign,
  PrimitiveModalCloseReason,
  PrimitiveModalProps,
  PrimitiveModalSlotProps,
} from './modal';

export type {
  CreateToastOptions,
  ToastAction,
  ToastContextValue,
  ToastId,
  ToastInput,
  ToastMessage,
  ToastMethodOptions,
  ToastProps,
  ToastProviderProps,
  ToastSeverity,
} from './toast';
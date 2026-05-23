// libs/ui/src/components/primitives/toast.tsx

'use client';

import * as React from 'react';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import type { AlertColor, AlertProps } from '@mui/material/Alert';
import type { ButtonProps } from '@mui/material/Button';
import type {
  SnackbarCloseReason,
  SnackbarOrigin,
  SnackbarProps,
} from '@mui/material/Snackbar';
import type { SxProps, Theme } from '@mui/material/styles';

import { mergeSx } from '../../utils';

export type ToastSeverity = AlertColor;

export type ToastId = string;

export type ToastAction = {
  label: React.ReactNode;
  onClick?: (toast: ToastMessage) => void;
  href?: string;
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;
  closeOnClick?: boolean;
  buttonProps?: Omit<
    ButtonProps,
    'children' | 'href' | 'target' | 'rel' | 'onClick'
  >;
};

export type ToastMessage = {
  id: ToastId;
  title?: React.ReactNode;
  message: React.ReactNode;
  severity?: ToastSeverity;
  action?: ToastAction;
  autoHideDuration?: number | null;
  persist?: boolean;
  alertProps?: Partial<AlertProps>;
};

export type CreateToastOptions = Omit<ToastMessage, 'id'> & {
  id?: ToastId;
};

export type ToastInput = React.ReactNode | CreateToastOptions;

export type ToastMethodOptions = Omit<
  CreateToastOptions,
  'message' | 'severity'
>;

export type ToastContextValue = {
  toast: (input: ToastInput) => ToastId;
  success: (message: React.ReactNode, options?: ToastMethodOptions) => ToastId;
  error: (message: React.ReactNode, options?: ToastMethodOptions) => ToastId;
  warning: (message: React.ReactNode, options?: ToastMethodOptions) => ToastId;
  info: (message: React.ReactNode, options?: ToastMethodOptions) => ToastId;
  dismiss: (id?: ToastId) => void;
  clear: () => void;
};

export interface ToastProps
  extends Omit<SnackbarProps, 'children' | 'message' | 'open' | 'onClose'> {
  open: boolean;
  toast: ToastMessage;
  onClose?: (
    event?: React.SyntheticEvent | Event,
    reason?: SnackbarCloseReason,
  ) => void;
  closeLabel?: string;
  ignoreClickaway?: boolean;
  alertVariant?: AlertProps['variant'];
  alertSx?: SxProps<Theme>;
  sx?: SxProps<Theme>;
}

export interface ToastProviderProps {
  children: React.ReactNode;
  anchorOrigin?: SnackbarOrigin;
  autoHideDuration?: number;
  maxQueued?: number;
  closeLabel?: string;
  ignoreClickaway?: boolean;
  alertVariant?: AlertProps['variant'];
  snackbarProps?: Omit<
    SnackbarProps,
    'children' | 'message' | 'open' | 'onClose'
  >;
  alertSx?: SxProps<Theme>;
}

const DEFAULT_AUTO_HIDE_DURATION = 6000;

const ToastContext = React.createContext<ToastContextValue | null>(null);

function createToastId(): ToastId {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isCreateToastOptions(input: ToastInput): input is CreateToastOptions {
  return (
    typeof input === 'object' &&
    input !== null &&
    !React.isValidElement(input) &&
    'message' in input
  );
}

function normalizeToast(input: ToastInput): ToastMessage {
  if (isCreateToastOptions(input)) {
    return {
      id: input.id ?? createToastId(),
      severity: input.severity ?? 'info',
      ...input,
    };
  }

  return {
    id: createToastId(),
    message: input,
    severity: 'info',
  };
}

function getActionRel(action: ToastAction): string | undefined {
  if (action.rel) {
    return action.rel;
  }

  if (action.href && action.target === '_blank') {
    return 'noopener noreferrer';
  }

  return undefined;
}

export function Toast({
  open,
  toast,
  onClose,
  closeLabel = 'Close notification',
  ignoreClickaway = true,
  alertVariant = 'filled',
  alertSx,
  anchorOrigin = {
    vertical: 'bottom',
    horizontal: 'right',
  },
  autoHideDuration = DEFAULT_AUTO_HIDE_DURATION,
  sx,
  ...snackbarProps
}: ToastProps): React.ReactElement {
  const resolvedAutoHideDuration = toast.persist
    ? null
    : toast.autoHideDuration === undefined
      ? autoHideDuration
      : toast.autoHideDuration;

  const handleClose = React.useCallback(
    (event?: React.SyntheticEvent | Event, reason?: SnackbarCloseReason) => {
      if (ignoreClickaway && reason === 'clickaway') {
        return;
      }

      onClose?.(event, reason);
    },
    [ignoreClickaway, onClose],
  );

  const action = toast.action ? (
    <Button
      component={toast.action.href ? 'a' : 'button'}
      href={toast.action.href}
      target={toast.action.target}
      rel={getActionRel(toast.action)}
      color="inherit"
      size="small"
      onClick={() => {
        toast.action?.onClick?.(toast);

        if (toast.action?.closeOnClick !== false) {
          handleClose(undefined, 'timeout');
        }
      }}
      {...toast.action.buttonProps}
      sx={mergeSx(
        {
          color: 'inherit',
          fontWeight: 900,
          textTransform: 'none',
        },
        toast.action.buttonProps?.sx,
      )}
    >
      {toast.action.label}
    </Button>
  ) : null;

  return (
    <Snackbar
      open={open}
      anchorOrigin={anchorOrigin}
      autoHideDuration={resolvedAutoHideDuration}
      onClose={handleClose}
      {...snackbarProps}
      sx={mergeSx(
        {
          maxWidth: {
            xs: 'calc(100vw - 32px)',
            sm: 460,
          },
        },
        sx,
      )}
    >
      <Alert
        severity={toast.severity ?? 'info'}
        variant={alertVariant}
        action={
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            {action}

            <IconButton
              aria-label={closeLabel}
              color="inherit"
              size="small"
              onClick={(event) => handleClose(event, 'timeout')}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        }
        {...toast.alertProps}
        sx={mergeSx(
          {
            width: '100%',
            alignItems: 'center',
            borderRadius: 2,
            boxShadow:
              '0 18px 54px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.1)',

            '& .MuiAlert-message': {
              minWidth: 0,
            },
          },
          alertSx,
          toast.alertProps?.sx,
        )}
      >
        {toast.title ? <AlertTitle>{toast.title}</AlertTitle> : null}
        {toast.message}
      </Alert>
    </Snackbar>
  );
}

export function ToastProvider({
  children,
  anchorOrigin = {
    vertical: 'bottom',
    horizontal: 'right',
  },
  autoHideDuration = DEFAULT_AUTO_HIDE_DURATION,
  maxQueued = 8,
  closeLabel = 'Close notification',
  ignoreClickaway = true,
  alertVariant = 'filled',
  snackbarProps,
  alertSx,
}: ToastProviderProps): React.ReactElement {
  const [queue, setQueue] = React.useState<ToastMessage[]>([]);
  const [activeToast, setActiveToast] = React.useState<ToastMessage | null>(
    null,
  );
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (activeToast || queue.length === 0) {
      return;
    }

    const [nextToast, ...remainingToasts] = queue;

    setActiveToast(nextToast);
    setQueue(remainingToasts);
    setOpen(true);
  }, [activeToast, queue]);

  React.useEffect(() => {
    if (open || !activeToast) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setActiveToast(null);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeToast, open]);

  const showToast = React.useCallback(
    (input: ToastInput): ToastId => {
      const nextToast = normalizeToast(input);

      setQueue((currentQueue) => {
        const nextQueue = [...currentQueue, nextToast];

        if (maxQueued <= 0) {
          return nextQueue;
        }

        return nextQueue.slice(-maxQueued);
      });

      return nextToast.id;
    },
    [maxQueued],
  );

  const dismiss = React.useCallback((id?: ToastId): void => {
    if (!id) {
      setOpen(false);
      return;
    }

    setQueue((currentQueue) =>
      currentQueue.filter((queuedToast) => queuedToast.id !== id),
    );

    setActiveToast((currentToast) => {
      if (currentToast?.id === id) {
        setOpen(false);
      }

      return currentToast;
    });
  }, []);

  const clear = React.useCallback((): void => {
    setQueue([]);
    setOpen(false);
  }, []);

  const contextValue = React.useMemo<ToastContextValue>(
    () => ({
      toast: showToast,
      success: (message, options) =>
        showToast({
          ...options,
          message,
          severity: 'success',
        }),
      error: (message, options) =>
        showToast({
          ...options,
          message,
          severity: 'error',
        }),
      warning: (message, options) =>
        showToast({
          ...options,
          message,
          severity: 'warning',
        }),
      info: (message, options) =>
        showToast({
          ...options,
          message,
          severity: 'info',
        }),
      dismiss,
      clear,
    }),
    [clear, dismiss, showToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {activeToast ? (
        <Toast
          open={open}
          toast={activeToast}
          anchorOrigin={anchorOrigin}
          autoHideDuration={autoHideDuration}
          closeLabel={closeLabel}
          ignoreClickaway={ignoreClickaway}
          alertVariant={alertVariant}
          alertSx={alertSx}
          onClose={() => setOpen(false)}
          {...snackbarProps}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.');
  }

  return context;
}

export default Toast;
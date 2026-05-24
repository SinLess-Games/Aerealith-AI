// libs/ui/src/components/layout/login-signup.tsx

'use client';

import * as React from 'react';
import type { FormEvent } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';

import type {
  LoginSignupMode,
  LoginSignupProps,
  LoginSignupSuccessPayload,
  StatusState,
} from '../../types';
import { mergeSx } from '../../utils';
import PrimitiveModal from '../primitives/modal';
import {
  getApiMessage,
  getErrorMessage,
  getModalDescription,
  getModalTitle,
  getStatusAlertSx,
  loginSignupDefaultLabels,
  LOGIN_SIGNUP_DEFAULT_LOGIN_ENDPOINT,
  LOGIN_SIGNUP_DEFAULT_PROFILE_HREF_PREFIX,
  LOGIN_SIGNUP_DEFAULT_SIGNUP_ENDPOINT,
  submitLogin as submitLoginRequest,
  submitSignup as submitSignupRequest,
} from './login-signup.functions';

export type { LoginSignupSuccessPayload };

const modalFieldSx: SxProps<Theme> = (theme) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    '& .MuiInputBase-root': {
      minHeight: 48,
      borderRadius: 999,
      color: theme.palette.text.primary,
      backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.86 : 0.96),
      boxShadow: `inset 0 0 0 1px ${alpha(
        theme.palette.common.white,
        isDark ? 0.04 : 0.5,
      )}`,
      transition:
        'border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease, transform 160ms ease',
    },

    '& .MuiInputBase-input': {
      px: 1.7,
      color: theme.palette.text.primary,
      fontSize: 15,
      fontWeight: 500,
      letterSpacing: '0.01em',
    },

    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: alpha(theme.palette.text.secondary, isDark ? 0.32 : 0.38),
    },

    '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: alpha(theme.palette.secondary.main, isDark ? 0.58 : 0.5),
    },

    '& .MuiInputBase-root.Mui-focused': {
      backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.96 : 1),
      boxShadow: `0 0 0 3px ${alpha(
        theme.palette.secondary.main,
        isDark ? 0.2 : 0.16,
      )}`,
    },

    '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.secondary.main,
      borderWidth: 1,
    },

    '& .MuiInputLabel-root': {
      color: theme.palette.text.secondary,
      fontSize: 15,
      fontWeight: 600,
      letterSpacing: '0.01em',
    },

    '& .MuiInputLabel-root.Mui-focused': {
      color: theme.palette.secondary.main,
    },

    '& .MuiInputLabel-root.Mui-disabled': {
      color: alpha(theme.palette.text.secondary, 0.42),
    },

    '& .MuiFormHelperText-root': {
      ml: 1.75,
      mt: 0.65,
      color: theme.palette.text.secondary,
      fontSize: 12,
      lineHeight: 1.45,
    },

    '& input:-webkit-autofill': {
      WebkitTextFillColor: theme.palette.text.primary,
      WebkitBoxShadow: `0 0 0 100px ${theme.palette.background.paper} inset`,
      caretColor: theme.palette.text.primary,
    },
  };
};

const modalPrimaryButtonSx: SxProps<Theme> = (theme) => ({
  minWidth: 118,
  minHeight: 42,
  px: 3,
  borderRadius: 999,
  color: theme.palette.primary.contrastText,
  fontWeight: 900,
  letterSpacing: '0.035em',
  textTransform: 'none',
  backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
  boxShadow: `0 10px 28px ${alpha(
    theme.palette.common.black,
    theme.palette.mode === 'dark' ? 0.34 : 0.16,
  )}`,

  '&:hover': {
    backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
    boxShadow: `0 0 24px ${alpha(
      theme.palette.secondary.main,
      theme.palette.mode === 'dark' ? 0.28 : 0.2,
    )}, 0 12px 30px ${alpha(theme.palette.common.black, 0.22)}`,
    transform: 'translateY(-1px)',
  },

  '&:disabled': {
    color: alpha(theme.palette.text.primary, 0.38),
    backgroundImage: 'none',
    backgroundColor: alpha(theme.palette.text.secondary, 0.14),
    boxShadow: 'none',
  },

  '@media (prefers-reduced-motion: reduce)': {
    '&:hover': {
      transform: 'none',
    },
  },
});

const modalSecondaryButtonSx: SxProps<Theme> = (theme) => ({
  minWidth: 106,
  minHeight: 42,
  px: 2.5,
  borderRadius: 999,
  color: theme.palette.text.primary,
  fontWeight: 800,
  letterSpacing: '0.025em',
  textTransform: 'none',
  borderColor: alpha(theme.palette.text.secondary, 0.34),
  backgroundColor: alpha(
    theme.palette.background.paper,
    theme.palette.mode === 'dark' ? 0.72 : 0.88,
  ),
  boxShadow: theme.shadows[theme.palette.mode === 'dark' ? 4 : 1],

  '&:hover': {
    color: theme.palette.secondary.main,
    borderColor: alpha(theme.palette.secondary.main, 0.72),
    backgroundColor: alpha(theme.palette.secondary.main, 0.08),
    boxShadow: `0 0 18px ${alpha(theme.palette.secondary.main, 0.14)}`,
    transform: 'translateY(-1px)',
  },

  '&:disabled': {
    color: alpha(theme.palette.text.secondary, 0.4),
    borderColor: alpha(theme.palette.text.secondary, 0.16),
    boxShadow: 'none',
  },

  '@media (prefers-reduced-motion: reduce)': {
    '&:hover': {
      transform: 'none',
    },
  },
});

const modalTextButtonSx: SxProps<Theme> = (theme) => ({
  minWidth: 'auto',
  p: 0,
  ml: 0.4,
  color: theme.palette.secondary.main,
  fontWeight: 900,
  textTransform: 'none',

  '&:hover': {
    color: theme.palette.primary.main,
    backgroundColor: 'transparent',
    textDecoration: 'underline',
    textUnderlineOffset: '0.2em',
  },
});

const modalPaperSx: SxProps<Theme> = (theme) => {
  const isDark = theme.palette.mode === 'dark';

  return {
    position: 'relative',
    overflow: 'hidden',
    width: {
      xs: 'calc(100vw - 32px)',
      sm: 480,
    },
    color: theme.palette.text.primary,
    bgcolor: alpha(theme.palette.background.paper, isDark ? 0.98 : 1),
    borderRadius: 4,
    border: `1px solid ${alpha(theme.palette.text.secondary, isDark ? 0.22 : 0.18)}`,
    backgroundImage: isDark
      ? `radial-gradient(circle at 50% -18%, ${alpha(
          theme.palette.primary.main,
          0.14,
        )}, transparent 34%), linear-gradient(180deg, ${alpha(
          theme.palette.background.paper,
          0.99,
        )}, ${alpha(theme.palette.background.default, 0.99)})`
      : `radial-gradient(circle at 50% -18%, ${alpha(
          theme.palette.secondary.main,
          0.1,
        )}, transparent 34%), linear-gradient(180deg, ${theme.palette.background.paper}, ${alpha(
          theme.palette.background.default,
          0.78,
        )})`,
    boxShadow: theme.shadows[isDark ? 14 : 8],
    backdropFilter: 'blur(18px) saturate(145%)',
    WebkitBackdropFilter: 'blur(18px) saturate(145%)',

    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      borderRadius: 'inherit',
      background: `linear-gradient(90deg, ${alpha(
        theme.palette.primary.main,
        0.7,
      )}, ${alpha(theme.palette.secondary.main, 0.7)}, ${alpha(
        theme.palette.primary.main,
        0.32,
      )})`,
      height: 2,
    },

    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      borderRadius: 'inherit',
      boxShadow: `inset 0 1px 0 ${alpha(
        theme.palette.common.white,
        isDark ? 0.06 : 0.8,
      )}`,
    },

    '& .MuiDialogTitle-root': {
      position: 'relative',
      zIndex: 1,
      px: 3,
      pt: 3,
      pb: 0.35,
      color: theme.palette.text.primary,
      fontFamily: theme.typography.h5.fontFamily,
      fontSize: 21,
      fontWeight: 900,
      lineHeight: 1.15,
      letterSpacing: '0.015em',
    },

    '& .MuiDialogContent-root': {
      position: 'relative',
      zIndex: 1,
      px: 3,
      py: 2.35,
    },

    '& .MuiDialogContentText-root': {
      color: theme.palette.text.secondary,
      fontSize: 14,
      lineHeight: 1.65,
    },

    '& .MuiDialogActions-root': {
      position: 'relative',
      zIndex: 1,
      px: 3,
      py: 2,
      borderTop: `1px solid ${alpha(theme.palette.text.secondary, isDark ? 0.14 : 0.16)}`,
      background: isDark
        ? `linear-gradient(180deg, ${alpha(
            theme.palette.common.white,
            0.025,
          )}, ${alpha(theme.palette.common.black, 0.2)})`
        : alpha(theme.palette.background.default, 0.42),
    },

    '& .MuiDivider-root': {
      borderColor: alpha(theme.palette.text.secondary, isDark ? 0.16 : 0.18),
    },

    '& .MuiIconButton-root': {
      top: 14,
      right: 14,
      color: theme.palette.text.secondary,
      border: `1px solid ${alpha(theme.palette.text.secondary, isDark ? 0.16 : 0.18)}`,
      backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.76 : 0.88),
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',

      '&:hover': {
        color: theme.palette.text.primary,
        borderColor: alpha(theme.palette.primary.main, 0.48),
        backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.12 : 0.08),
        boxShadow: `0 0 16px ${alpha(theme.palette.primary.main, 0.18)}`,
      },
    },
  };
};

const rootPrimaryButtonSx: SxProps<Theme> = (theme) => ({
  borderRadius: 999,
  fontWeight: 900,
  letterSpacing: '0.04em',
  textTransform: 'none',
  color: theme.palette.primary.contrastText,
  backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,

  '&:hover': {
    backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
  },
});

const rootSecondaryButtonSx: SxProps<Theme> = (theme) => ({
  borderRadius: 999,
  fontWeight: 900,
  letterSpacing: '0.04em',
  textTransform: 'none',
  color: theme.palette.text.primary,
  borderColor: alpha(theme.palette.text.secondary, 0.34),
  backgroundColor: alpha(
    theme.palette.background.paper,
    theme.palette.mode === 'dark' ? 0.36 : 0.72,
  ),

  '&:hover': {
    color: theme.palette.secondary.main,
    borderColor: alpha(theme.palette.secondary.main, 0.72),
    backgroundColor: alpha(theme.palette.secondary.main, 0.08),
  },
});

export function LoginSignup({
  loginEndpoint = LOGIN_SIGNUP_DEFAULT_LOGIN_ENDPOINT,
  signupEndpoint = LOGIN_SIGNUP_DEFAULT_SIGNUP_ENDPOINT,
  profileHrefPrefix = LOGIN_SIGNUP_DEFAULT_PROFILE_HREF_PREFIX,
  onSuccess,
  onError,
  onOpen,
  onClose,
  sx,
  rootSx,
  formSx,
  actionsSx,
  defaultMode = null,
  labels: labelsProp,
  hideIntro = false,
  closeOnLoginSuccess = true,
  closeOnSignupSuccess = false,
  buttonSize = 'large',
  modalMaxWidth = 'xs',
}: LoginSignupProps): React.ReactElement {
  const reactId = React.useId();

  const [activeMode, setActiveMode] = React.useState<LoginSignupMode | null>(
    defaultMode,
  );
  const [formVersion, setFormVersion] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [status, setStatus] = React.useState<StatusState | null>(null);

  const labels = React.useMemo(
    () => ({
      ...loginSignupDefaultLabels,
      ...labelsProp,
    }),
    [labelsProp],
  );

  const isLogin = activeMode === 'login';
  const isSignup = activeMode === 'signup';
  const signupCompleted = isSignup && status?.severity === 'success';
  const modalOpen = activeMode !== null;

  const formId = `${reactId}-${
    isSignup ? 'helix-signup-form' : 'helix-login-form'
  }`;

  const resetCurrentForm = React.useCallback((): void => {
    setFormVersion((current) => current + 1);
  }, []);

  const openMode = React.useCallback(
    (mode: LoginSignupMode): void => {
      if (submitting) {
        return;
      }

      setStatus(null);
      setActiveMode(mode);
      resetCurrentForm();
      onOpen?.(mode);
    },
    [onOpen, resetCurrentForm, submitting],
  );

  const openLogin = React.useCallback((): void => {
    openMode('login');
  }, [openMode]);

  const openSignup = React.useCallback((): void => {
    openMode('signup');
  }, [openMode]);

  const closeModal = React.useCallback((): void => {
    if (submitting) {
      return;
    }

    setStatus(null);
    setActiveMode(null);
    resetCurrentForm();
    onClose?.();
  }, [onClose, resetCurrentForm, submitting]);

  const switchMode = React.useCallback(
    (mode: LoginSignupMode): void => {
      if (submitting) {
        return;
      }

      setStatus(null);
      setActiveMode(mode);
      resetCurrentForm();
      onOpen?.(mode);
    },
    [onOpen, resetCurrentForm, submitting],
  );

  const handleLoginSuccess = React.useCallback(
    (payload: LoginSignupSuccessPayload): void => {
      setStatus(null);
      resetCurrentForm();

      if (closeOnLoginSuccess) {
        setActiveMode(null);
      }

      onSuccess?.(payload);
    },
    [closeOnLoginSuccess, onSuccess, resetCurrentForm],
  );

  const handleSignupSuccess = React.useCallback(
    (payload: LoginSignupSuccessPayload): void => {
      resetCurrentForm();

      if (closeOnSignupSuccess) {
        setStatus(null);
        setActiveMode(null);
      } else {
        setActiveMode('signup');
        setStatus({
          severity: 'success',
          message: getApiMessage(
            payload.response,
            labels.signupSuccessFallback,
          ),
        });
      }

      onSuccess?.(payload);
    },
    [
      closeOnSignupSuccess,
      labels.signupSuccessFallback,
      onSuccess,
      resetCurrentForm,
    ],
  );

  const handleSubmit = React.useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      if (!activeMode) {
        return;
      }

      setSubmitting(true);
      setStatus(null);

      try {
        const formData = new FormData(event.currentTarget);

        if (activeMode === 'login') {
          const payload = await submitLoginRequest({
            endpoint: loginEndpoint,
            formData,
            profileHrefPrefix,
          });

          handleLoginSuccess(payload);
          return;
        }

        const payload = await submitSignupRequest({
          endpoint: signupEndpoint,
          formData,
          profileHrefPrefix,
        });

        handleSignupSuccess(payload);
      } catch (error) {
        setStatus({
          severity: 'error',
          message: getErrorMessage(error),
        });
        onError?.(error);
      } finally {
        setSubmitting(false);
      }
    },
    [
      activeMode,
      handleLoginSuccess,
      handleSignupSuccess,
      loginEndpoint,
      onError,
      profileHrefPrefix,
      signupEndpoint,
    ],
  );

  const rootStyles: SxProps<Theme> = mergeSx(
    {
      width: '100%',
      maxWidth: 420,
      mx: 'auto',
      p: 3,
      border: 0,
      borderRadius: 0,
      bgcolor: 'transparent',
      backgroundColor: 'transparent',
      backgroundImage: 'none',
      boxShadow: 'none',
      backdropFilter: 'none',
    },
    rootSx,
    sx,
  );

  const renderModePill = (): React.ReactElement => (
    <Box
      sx={(theme) => ({
        alignSelf: 'flex-start',
        px: 1.15,
        py: 0.5,
        borderRadius: 999,
        color: theme.palette.secondary.main,
        border: `1px solid ${alpha(theme.palette.secondary.main, 0.28)}`,
        backgroundColor: alpha(theme.palette.secondary.main, 0.08),
        boxShadow: `0 0 14px ${alpha(theme.palette.secondary.main, 0.08)}`,
        fontFamily: theme.typography.overline.fontFamily,
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: '0.105em',
        lineHeight: 1,
        textTransform: 'uppercase',
      })}
    >
      Helix Access
    </Box>
  );

  const renderLoginFields = (): React.ReactElement => (
    <>
      <TextField
        label="Email or user name"
        name="identifier"
        type="text"
        defaultValue=""
        autoComplete="username"
        required
        fullWidth
        disabled={submitting}
        sx={modalFieldSx}
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        defaultValue=""
        autoComplete="current-password"
        required
        fullWidth
        disabled={submitting}
        sx={modalFieldSx}
      />

      <Typography
        variant="body2"
        sx={(theme) => ({
          color: theme.palette.text.secondary,
          fontSize: 13.5,
          lineHeight: 1.7,
        })}
      >
        {labels.loginSwitchPrompt}{' '}
        <Button
          type="button"
          size="small"
          onClick={() => switchMode('signup')}
          disabled={submitting}
          sx={modalTextButtonSx}
        >
          {labels.loginSwitchButton}
        </Button>
      </Typography>
    </>
  );

  const renderSignupFields = (): React.ReactElement => (
    <>
      <TextField
        label="User name"
        name="username"
        type="text"
        defaultValue=""
        autoComplete="username"
        required
        fullWidth
        disabled={submitting}
        helperText={labels.usernameHelperText}
        sx={modalFieldSx}
      />

      <TextField
        label="Name"
        name="displayName"
        type="text"
        defaultValue=""
        autoComplete="name"
        required
        fullWidth
        disabled={submitting}
        sx={modalFieldSx}
      />

      <TextField
        label="Email"
        name="email"
        type="email"
        defaultValue=""
        autoComplete="email"
        required
        fullWidth
        disabled={submitting}
        sx={modalFieldSx}
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        defaultValue=""
        autoComplete="new-password"
        required
        fullWidth
        disabled={submitting}
        sx={modalFieldSx}
      />

      <TextField
        label="Confirm password"
        name="confirmPassword"
        type="password"
        defaultValue=""
        autoComplete="new-password"
        required
        fullWidth
        disabled={submitting}
        sx={modalFieldSx}
      />

      <Typography
        variant="body2"
        sx={(theme) => ({
          color: theme.palette.text.secondary,
          fontSize: 13.5,
          lineHeight: 1.7,
        })}
      >
        {labels.signupSwitchPrompt}{' '}
        <Button
          type="button"
          size="small"
          onClick={() => switchMode('login')}
          disabled={submitting}
          sx={modalTextButtonSx}
        >
          {labels.signupSwitchButton}
        </Button>
      </Typography>
    </>
  );

  const modalActions = (
    <Box
      sx={mergeSx(
        {
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: 1.25,
          width: '100%',
        },
        actionsSx,
      )}
    >
      <Button
        type="button"
        onClick={closeModal}
        disabled={submitting}
        sx={modalSecondaryButtonSx}
      >
        {signupCompleted ? labels.closeButton : labels.cancelButton}
      </Button>

      {signupCompleted ? null : (
        <Button
          type="submit"
          form={formId}
          variant="contained"
          disabled={submitting}
          sx={modalPrimaryButtonSx}
        >
          {submitting
            ? labels.submittingButton
            : isSignup
              ? labels.submitSignupButton
              : labels.submitLoginButton}
        </Button>
      )}
    </Box>
  );

  const modalContent = (
    <Box
      key={`${activeMode ?? 'closed'}-${formVersion}`}
      component="form"
      id={formId}
      noValidate
      onSubmit={handleSubmit}
      sx={mergeSx(
        {
          pt: 0.35,
        },
        formSx,
      )}
    >
      <Stack spacing={2}>
        {status ? (
          <Alert
            severity={status.severity}
            sx={mergeSx(getStatusAlertSx(status.severity), (theme) => ({
              borderRadius: 3,
              border: `1px solid ${alpha(theme.palette.text.secondary, 0.16)}`,
              backgroundColor: alpha(
                theme.palette.background.paper,
                theme.palette.mode === 'dark' ? 0.92 : 0.98,
              ),
              color: theme.palette.text.primary,
              fontSize: 13.5,
              lineHeight: 1.55,

              '& .MuiAlert-icon': {
                color:
                  status.severity === 'success'
                    ? theme.palette.success.main
                    : theme.palette.error.main,
              },
            }))}
          >
            {status.message}
          </Alert>
        ) : null}

        {signupCompleted ? null : (
          <Stack spacing={1} sx={{ mb: 0.25 }}>
            {renderModePill()}

            <Typography
              variant="body2"
              sx={(theme) => ({
                color: theme.palette.text.secondary,
                fontSize: 13.5,
                lineHeight: 1.65,
              })}
            >
              {isSignup
                ? 'Create your profile and prepare your Helix AI workspace.'
                : 'Access your Helix AI account and continue where you left off.'}
            </Typography>
          </Stack>
        )}

        {signupCompleted ? null : isLogin ? renderLoginFields() : null}
        {signupCompleted ? null : isSignup ? renderSignupFields() : null}
      </Stack>
    </Box>
  );

  return (
    <>
      <Box component="section" sx={rootStyles}>
        <Stack spacing={2.5}>
          {hideIntro ? null : (
            <>
              <Stack spacing={0.75} textAlign="center">
                <Typography
                  variant="h5"
                  component="h2"
                  fontWeight={900}
                  sx={(theme) => ({
                    color: theme.palette.text.primary,
                    letterSpacing: '0.02em',
                  })}
                >
                  {labels.title}
                </Typography>

                <Typography
                  variant="body2"
                  sx={(theme) => ({
                    color: theme.palette.text.secondary,
                    lineHeight: 1.65,
                  })}
                >
                  {labels.description}
                </Typography>
              </Stack>

              <Divider
                sx={(theme) => ({
                  borderColor: theme.palette.divider,
                })}
              />
            </>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              type="button"
              fullWidth
              size={buttonSize}
              variant="contained"
              onClick={openLogin}
              disabled={submitting}
              sx={rootPrimaryButtonSx}
            >
              {labels.loginButton}
            </Button>

            <Button
              type="button"
              fullWidth
              size={buttonSize}
              variant="outlined"
              onClick={openSignup}
              disabled={submitting}
              sx={rootSecondaryButtonSx}
            >
              {labels.signupButton}
            </Button>
          </Stack>
        </Stack>
      </Box>

      <PrimitiveModal
        open={modalOpen}
        onClose={closeModal}
        title={getModalTitle(activeMode, labels)}
        description={getModalDescription(activeMode, labels)}
        dividers
        maxWidth={modalMaxWidth}
        actions={modalActions}
        paperSx={modalPaperSx}
      >
        {modalContent}
      </PrimitiveModal>
    </>
  );
}

export default LoginSignup;
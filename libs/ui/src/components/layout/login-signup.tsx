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
import type { SxProps, Theme } from '@mui/material/styles';

import type {
  LoginSignupMode,
  LoginSignupProps,
  LoginSignupSuccessPayload,
  StatusState,
} from '../../types';
import { mergeSx } from '../../utils';
import PrimitiveModal from '../primitives/modal';
import {
  fieldSx,
  getApiMessage,
  getErrorMessage,
  getModalDescription,
  getModalTitle,
  getStatusAlertSx,
  loginSignupDefaultLabels,
  LOGIN_SIGNUP_DEFAULT_LOGIN_ENDPOINT,
  LOGIN_SIGNUP_DEFAULT_PROFILE_HREF_PREFIX,
  LOGIN_SIGNUP_DEFAULT_SIGNUP_ENDPOINT,
  primaryButtonSx,
  secondaryButtonSx,
  submitLogin as submitLoginRequest,
  submitSignup as submitSignupRequest,
  textButtonSx,
} from './login-signup.functions';

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
        sx={fieldSx}
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
        sx={fieldSx}
      />

      <Typography
        variant="body2"
        sx={{
          color: 'rgba(170, 190, 220, 0.82)',
        }}
      >
        {labels.loginSwitchPrompt}{' '}
        <Button
          type="button"
          size="small"
          onClick={() => switchMode('signup')}
          disabled={submitting}
          sx={textButtonSx}
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
        sx={fieldSx}
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
        sx={fieldSx}
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
        sx={fieldSx}
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
        sx={fieldSx}
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
        sx={fieldSx}
      />

      <Typography
        variant="body2"
        sx={{
          color: 'rgba(170, 190, 220, 0.82)',
        }}
      >
        {labels.signupSwitchPrompt}{' '}
        <Button
          type="button"
          size="small"
          onClick={() => switchMode('login')}
          disabled={submitting}
          sx={textButtonSx}
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
          gap: 1,
        },
        actionsSx,
      )}
    >
      <Button
        type="button"
        onClick={closeModal}
        disabled={submitting}
        sx={secondaryButtonSx}
      >
        {signupCompleted ? labels.closeButton : labels.cancelButton}
      </Button>

      {signupCompleted ? null : (
        <Button
          type="submit"
          form={formId}
          variant="contained"
          disabled={submitting}
          sx={primaryButtonSx}
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
      sx={formSx}
    >
      <Stack spacing={2}>
        {status ? (
          <Alert
            severity={status.severity}
            sx={getStatusAlertSx(status.severity)}
          >
            {status.message}
          </Alert>
        ) : null}

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
                  fontWeight={800}
                  sx={{
                    color: '#ffffff',
                    letterSpacing: '0.02em',
                    textShadow:
                      '0 0 8px rgba(255, 255, 255, 0.38), 0 0 14px rgba(246, 6, 111, 0.34)',
                  }}
                >
                  {labels.title}
                </Typography>

                <Typography
                  variant="body2"
                  sx={{
                    color: 'rgba(170, 190, 220, 0.82)',
                  }}
                >
                  {labels.description}
                </Typography>
              </Stack>

              <Divider
                sx={{
                  borderColor: 'rgba(139, 233, 255, 0.16)',
                }}
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
              sx={primaryButtonSx}
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
              sx={secondaryButtonSx}
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
        paperSx={{
          color: '#ffffff',
          bgcolor: 'rgba(9, 10, 26, 0.96)',
          backgroundImage:
            'linear-gradient(135deg, rgba(246, 6, 111, 0.12), rgba(2, 35, 113, 0.22))',
          border: '1px solid rgba(246, 6, 111, 0.34)',
          boxShadow:
            '0 0 30px rgba(246, 6, 111, 0.22), 0 0 22px rgba(139, 233, 255, 0.1)',
        }}
      >
        {modalContent}
      </PrimitiveModal>
    </>
  );
}

export default LoginSignup;

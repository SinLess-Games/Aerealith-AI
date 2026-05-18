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

import PrimitiveModal from './modal';

export type LoginSignupMode = 'login' | 'signup';

export type LoginSignupSuccessPayload = {
  mode: LoginSignupMode;
  response: unknown;
  username?: string;
  profileHref?: string;
};

export type LoginSignupProps = {
  loginEndpoint?: string;
  signupEndpoint?: string;
  profileHrefPrefix?: string;
  onSuccess?: (payload: LoginSignupSuccessPayload) => void;
  sx?: SxProps<Theme>;
};

type StatusState = {
  severity: 'success' | 'error';
  message: string;
};

type SignupRequestBody = {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  timezone?: string;
  locale?: string;
};

type UnknownRecord = Record<string, unknown>;

const h = React.createElement;

const MuiAlert = Alert as React.ElementType;
const MuiBox = Box as React.ElementType;
const MuiButton = Button as React.ElementType;
const MuiDivider = Divider as React.ElementType;
const MuiStack = Stack as React.ElementType;
const MuiTextField = TextField as React.ElementType;
const MuiTypography = Typography as React.ElementType;

const CURRENT_USERNAME_STORAGE_KEY = 'helix.currentUsername';
const USERNAME_COOKIE_NAME = 'helix_username';
const PERSISTED_USERNAME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const primaryButtonSx: SxProps<Theme> = {
  color: '#ffffff',
  background:
    'linear-gradient(135deg, rgba(246, 6, 111, 0.96), rgba(92, 0, 255, 0.96))',
  border: '1px solid rgba(246, 6, 111, 0.72)',
  borderRadius: 999,
  boxShadow:
    '0 0 14px rgba(246, 6, 111, 0.36), inset 0 0 10px rgba(255, 255, 255, 0.08)',
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'none',
  textShadow: '0 0 8px rgba(255, 255, 255, 0.45)',
  transition:
    'transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease',

  '&:hover': {
    background:
      'linear-gradient(135deg, rgba(255, 31, 136, 1), rgba(110, 20, 255, 1))',
    borderColor: 'rgba(139, 233, 255, 0.72)',
    boxShadow:
      '0 0 18px rgba(246, 6, 111, 0.48), 0 0 12px rgba(139, 233, 255, 0.2), inset 0 0 10px rgba(255, 255, 255, 0.1)',
    transform: 'translateY(-1px)',
  },

  '&:focus-visible': {
    outline: '2px solid rgba(139, 233, 255, 0.85)',
    outlineOffset: 3,
  },

  '&.Mui-disabled': {
    color: 'rgba(255, 255, 255, 0.48)',
    background:
      'linear-gradient(135deg, rgba(246, 6, 111, 0.32), rgba(92, 0, 255, 0.32))',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    boxShadow: 'none',
  },
};

const secondaryButtonSx: SxProps<Theme> = {
  color: '#8be9ff',
  backgroundColor: 'rgba(2, 35, 113, 0.28)',
  border: '1px solid rgba(139, 233, 255, 0.34)',
  borderRadius: 999,
  boxShadow:
    '0 0 12px rgba(139, 233, 255, 0.14), inset 0 0 8px rgba(255, 255, 255, 0.06)',
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'none',
  textShadow:
    '0 0 6px rgba(139, 233, 255, 0.72), 0 0 12px rgba(246, 6, 111, 0.28)',
  transition:
    'transform 180ms ease, color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease',

  '&:hover': {
    color: '#ffffff',
    backgroundColor: 'rgba(246, 6, 111, 0.26)',
    borderColor: 'rgba(246, 6, 111, 0.62)',
    boxShadow:
      '0 0 16px rgba(246, 6, 111, 0.34), 0 0 12px rgba(139, 233, 255, 0.18), inset 0 0 8px rgba(255, 255, 255, 0.08)',
    transform: 'translateY(-1px)',
  },

  '&:focus-visible': {
    outline: '2px solid rgba(246, 6, 111, 0.85)',
    outlineOffset: 3,
  },

  '&.Mui-disabled': {
    color: 'rgba(139, 233, 255, 0.36)',
    borderColor: 'rgba(139, 233, 255, 0.14)',
    backgroundColor: 'rgba(2, 35, 113, 0.14)',
    boxShadow: 'none',
  },
};

const textButtonSx: SxProps<Theme> = {
  color: '#8be9ff',
  fontWeight: 800,
  textTransform: 'none',
  textShadow: '0 0 8px rgba(139, 233, 255, 0.42)',

  '&:hover': {
    color: '#ffffff',
    backgroundColor: 'rgba(246, 6, 111, 0.14)',
    textShadow: '0 0 10px rgba(246, 6, 111, 0.55)',
  },
};

const fieldSx: SxProps<Theme> = {
  '& .MuiInputBase-root': {
    color: '#ffffff',
    borderRadius: 2,
    backgroundColor: 'rgba(9, 10, 26, 0.72)',
  },

  '& .MuiInputLabel-root': {
    color: 'rgba(139, 233, 255, 0.78)',
  },

  '& .MuiInputLabel-root.Mui-focused': {
    color: '#8be9ff',
  },

  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(139, 233, 255, 0.22)',
  },

  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(246, 6, 111, 0.5)',
  },

  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(139, 233, 255, 0.82)',
    boxShadow: '0 0 12px rgba(139, 233, 255, 0.18)',
  },

  '& .MuiFormHelperText-root': {
    color: 'rgba(170, 190, 220, 0.72)',
  },
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNestedValue(value: unknown, path: readonly string[]): unknown {
  let current = value;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function readNestedString(
  value: unknown,
  paths: readonly (readonly string[])[],
): string | undefined {
  for (const path of paths) {
    const candidate = readNestedValue(value, path);

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function unwrapApiResponse(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if (value.success === true && 'data' in value) {
    return value.data;
  }

  return value;
}

function extractUsernameFromResponse(value: unknown): string | undefined {
  const data = unwrapApiResponse(value);

  return readNestedString(data, [
    ['user', 'username'],
    ['user', 'handle'],
    ['user', 'login'],
    ['profile', 'username'],
    ['profile', 'handle'],
    ['account', 'username'],
    ['identity', 'username'],
    ['accessClaims', 'username'],
    ['refreshClaims', 'username'],
    ['session', 'username'],
    ['username'],
    ['handle'],
    ['login'],
  ]);
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeUsernameCandidate(value: string): string | undefined {
  const username = value.trim();

  if (!username || looksLikeEmail(username)) {
    return undefined;
  }

  return username;
}

function buildProfileHref(
  profileHrefPrefix: string,
  username: string | undefined,
): string | undefined {
  const normalizedUsername = username?.trim();

  if (!normalizedUsername) {
    return undefined;
  }

  return `${profileHrefPrefix.replace(/\/+$/, '')}/${encodeURIComponent(
    normalizedUsername,
  )}`;
}

function writeBrowserCookie(name: string, value: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${PERSISTED_USERNAME_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ].join('; ');
}

function persistUsername(username: string | undefined): void {
  const normalizedUsername = username?.trim();

  if (!normalizedUsername || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      CURRENT_USERNAME_STORAGE_KEY,
      normalizedUsername,
    );
  } catch {
    // Ignore storage failures. The cookie is enough for header hydration.
  }

  writeBrowserCookie(USERNAME_COOKIE_NAME, normalizedUsername);
}

async function readApiResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getApiMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.detail;

    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    const nestedData = record.data;

    if (typeof nestedData === 'object' && nestedData !== null) {
      const nestedRecord = nestedData as Record<string, unknown>;
      const nestedMessage =
        nestedRecord.message ?? nestedRecord.error ?? nestedRecord.detail;

      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage;
      }

      const nestedVerification = nestedRecord.verification;

      if (
        typeof nestedVerification === 'object' &&
        nestedVerification !== null
      ) {
        const verificationRecord = nestedVerification as Record<
          string,
          unknown
        >;
        const verificationMessage = verificationRecord.message;

        if (
          typeof verificationMessage === 'string' &&
          verificationMessage.trim()
        ) {
          return verificationMessage;
        }
      }
    }
  }

  return fallback;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function getBrowserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function getBrowserLocale(): string | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  return navigator.language || undefined;
}

function readFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);

  if (typeof value !== 'string') {
    return '';
  }

  return value;
}

async function postJson(endpoint: string, body: unknown): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  const data = await readApiResponse(response);

  if (!response.ok) {
    throw new Error(
      getApiMessage(data, `Request failed with status ${response.status}.`),
    );
  }

  return data;
}

export function LoginSignup({
  loginEndpoint = '/api/V1/auth/login',
  signupEndpoint = '/api/V1/auth/signup',
  profileHrefPrefix = '/profile',
  onSuccess,
  sx,
}: LoginSignupProps): React.ReactElement {
  const [activeMode, setActiveMode] = React.useState<LoginSignupMode | null>(
    null,
  );
  const [formVersion, setFormVersion] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [status, setStatus] = React.useState<StatusState | null>(null);

  const isLogin = activeMode === 'login';
  const isSignup = activeMode === 'signup';
  const signupCompleted = isSignup && status?.severity === 'success';
  const modalOpen = activeMode !== null;
  const formId = isSignup ? 'helix-signup-form' : 'helix-login-form';

  const rootSx = [
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
    ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
  ] as SxProps<Theme>;

  const resetCurrentForm = (): void => {
    setFormVersion((current) => current + 1);
  };

  const openLogin = (): void => {
    setStatus(null);
    setActiveMode('login');
    resetCurrentForm();
  };

  const openSignup = (): void => {
    setStatus(null);
    setActiveMode('signup');
    resetCurrentForm();
  };

  const closeModal = (): void => {
    if (submitting) {
      return;
    }

    setStatus(null);
    setActiveMode(null);
    resetCurrentForm();
  };

  const switchMode = (mode: LoginSignupMode): void => {
    if (submitting) {
      return;
    }

    setStatus(null);
    setActiveMode(mode);
    resetCurrentForm();
  };

  const submitLogin = async (formData: FormData): Promise<void> => {
    const identifier = readFormValue(formData, 'identifier').trim();
    const password = readFormValue(formData, 'password');

    if (!identifier || !password) {
      throw new Error('Email or user name and password are required.');
    }

    const response = await postJson(loginEndpoint, {
      identifier,
      password,
    });

    const username =
      extractUsernameFromResponse(response) ??
      normalizeUsernameCandidate(identifier);

    const profileHref = buildProfileHref(profileHrefPrefix, username);

    persistUsername(username);

    setStatus(null);
    setActiveMode(null);
    resetCurrentForm();

    onSuccess?.({
      mode: 'login',
      response,
      ...(username === undefined ? {} : { username }),
      ...(profileHref === undefined ? {} : { profileHref }),
    });
  };

  const submitSignup = async (formData: FormData): Promise<void> => {
    const username = readFormValue(formData, 'username').trim().toLowerCase();
    const displayName = readFormValue(formData, 'displayName').trim();
    const email = readFormValue(formData, 'email').trim().toLowerCase();
    const password = readFormValue(formData, 'password');
    const confirmPassword = readFormValue(formData, 'confirmPassword');

    if (!username || !displayName || !email || !password || !confirmPassword) {
      throw new Error(
        'User name, name, email, password, and password confirmation are required.',
      );
    }

    if (!/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/.test(username)) {
      throw new Error(
        'User name must be 3-32 characters and may only use letters, numbers, dots, underscores, or hyphens. It must start and end with a letter or number.',
      );
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const body: SignupRequestBody = {
      username,
      email,
      password,
      displayName,
      timezone: getBrowserTimezone(),
      locale: getBrowserLocale(),
    };

    const response = await postJson(signupEndpoint, body);
    const responseUsername = extractUsernameFromResponse(response) ?? username;
    const profileHref = buildProfileHref(profileHrefPrefix, responseUsername);

    persistUsername(responseUsername);

    setActiveMode('signup');
    resetCurrentForm();
    setStatus({
      severity: 'success',
      message: getApiMessage(
        response,
        'Account created. Check your email to verify your account.',
      ),
    });

    onSuccess?.({
      mode: 'signup',
      response,
      username: responseUsername,
      ...(profileHref === undefined ? {} : { profileHref }),
    });
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();

    if (!activeMode) {
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const formData = new FormData(event.currentTarget);

      if (activeMode === 'login') {
        await submitLogin(formData);
      } else {
        await submitSignup(formData);
      }
    } catch (error) {
      setStatus({
        severity: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderLoginFields = (): React.ReactElement =>
    h(
      React.Fragment,
      {
        key: 'login-fields',
      },
      h(MuiTextField, {
        key: 'login-identifier',
        label: 'Email or user name',
        name: 'identifier',
        type: 'text',
        defaultValue: '',
        autoComplete: 'username',
        required: true,
        fullWidth: true,
        disabled: submitting,
        sx: fieldSx,
      }),
      h(MuiTextField, {
        key: 'login-password',
        label: 'Password',
        name: 'password',
        type: 'password',
        defaultValue: '',
        autoComplete: 'current-password',
        required: true,
        fullWidth: true,
        disabled: submitting,
        sx: fieldSx,
      }),
      h(
        MuiTypography,
        {
          key: 'login-helper',
          variant: 'body2',
          color: 'rgba(170, 190, 220, 0.82)',
        },
        'Need an account? ',
        h(
          MuiButton,
          {
            size: 'small',
            onClick: () => switchMode('signup'),
            disabled: submitting,
            sx: textButtonSx,
          },
          'Signup',
        ),
      ),
    );

  const renderSignupFields = (): React.ReactElement =>
    h(
      React.Fragment,
      {
        key: 'signup-fields',
      },
      h(MuiTextField, {
        key: 'signup-username',
        label: 'User name',
        name: 'username',
        type: 'text',
        defaultValue: '',
        autoComplete: 'username',
        required: true,
        fullWidth: true,
        disabled: submitting,
        helperText:
          'Use 3-32 letters, numbers, dots, underscores, or hyphens.',
        sx: fieldSx,
      }),
      h(MuiTextField, {
        key: 'signup-display-name',
        label: 'Name',
        name: 'displayName',
        type: 'text',
        defaultValue: '',
        autoComplete: 'name',
        required: true,
        fullWidth: true,
        disabled: submitting,
        sx: fieldSx,
      }),
      h(MuiTextField, {
        key: 'signup-email',
        label: 'Email',
        name: 'email',
        type: 'email',
        defaultValue: '',
        autoComplete: 'email',
        required: true,
        fullWidth: true,
        disabled: submitting,
        sx: fieldSx,
      }),
      h(MuiTextField, {
        key: 'signup-password',
        label: 'Password',
        name: 'password',
        type: 'password',
        defaultValue: '',
        autoComplete: 'new-password',
        required: true,
        fullWidth: true,
        disabled: submitting,
        sx: fieldSx,
      }),
      h(MuiTextField, {
        key: 'signup-confirm-password',
        label: 'Confirm password',
        name: 'confirmPassword',
        type: 'password',
        defaultValue: '',
        autoComplete: 'new-password',
        required: true,
        fullWidth: true,
        disabled: submitting,
        sx: fieldSx,
      }),
      h(
        MuiTypography,
        {
          key: 'signup-helper',
          variant: 'body2',
          color: 'rgba(170, 190, 220, 0.82)',
        },
        'Already have an account? ',
        h(
          MuiButton,
          {
            size: 'small',
            onClick: () => switchMode('login'),
            disabled: submitting,
            sx: textButtonSx,
          },
          'Login',
        ),
      ),
    );

  const modalTitle = isSignup ? 'Create your account' : 'Log in';

  const modalDescription = isSignup
    ? 'Create a Helix AI account to continue.'
    : 'Log in to your Helix AI account.';

  const modalActions = h(
    React.Fragment,
    null,
    h(
      MuiButton,
      {
        onClick: closeModal,
        disabled: submitting,
        sx: secondaryButtonSx,
      },
      signupCompleted ? 'Close' : 'Cancel',
    ),
    signupCompleted
      ? null
      : h(
          MuiButton,
          {
            type: 'submit',
            form: formId,
            variant: 'contained',
            disabled: submitting,
            sx: primaryButtonSx,
          },
          submitting ? 'Submitting...' : isSignup ? 'Signup' : 'Login',
        ),
  );

  const modalContent = h(
    MuiBox,
    {
      key: `${activeMode ?? 'closed'}-${formVersion}`,
      component: 'form',
      id: formId,
      noValidate: true,
      onSubmit: handleSubmit,
    },
    h(
      MuiStack,
      {
        spacing: 2,
      },
      status
        ? h(
            MuiAlert,
            {
              severity: status.severity,
              sx: {
                borderRadius: 2,
                border:
                  status.severity === 'success'
                    ? '1px solid rgba(139, 233, 255, 0.32)'
                    : '1px solid rgba(246, 6, 111, 0.24)',
                backgroundColor:
                  status.severity === 'success'
                    ? 'rgba(139, 233, 255, 0.1)'
                    : 'rgba(246, 6, 111, 0.1)',
                color: '#ffffff',
              },
            },
            status.message,
          )
        : null,
      signupCompleted ? null : isLogin ? renderLoginFields() : null,
      signupCompleted ? null : isSignup ? renderSignupFields() : null,
    ),
  );

  return h(
    React.Fragment,
    null,
    h(
      MuiBox,
      {
        component: 'section',
        sx: rootSx,
      },
      h(
        MuiStack,
        {
          spacing: 2.5,
        },
        h(
          MuiStack,
          {
            spacing: 0.75,
            textAlign: 'center',
          },
          h(
            MuiTypography,
            {
              variant: 'h5',
              component: 'h2',
              fontWeight: 800,
              sx: {
                color: '#ffffff',
                letterSpacing: '0.02em',
                textShadow:
                  '0 0 8px rgba(255, 255, 255, 0.38), 0 0 14px rgba(246, 6, 111, 0.34)',
              },
            },
            'Welcome to Helix AI',
          ),
          h(
            MuiTypography,
            {
              variant: 'body2',
              sx: {
                color: 'rgba(170, 190, 220, 0.82)',
              },
            },
            'Log in or create an account to continue.',
          ),
        ),
        h(MuiDivider, {
          sx: {
            borderColor: 'rgba(139, 233, 255, 0.16)',
          },
        }),
        h(
          MuiStack,
          {
            direction: { xs: 'column', sm: 'row' },
            spacing: 1.5,
          },
          h(
            MuiButton,
            {
              fullWidth: true,
              size: 'large',
              variant: 'contained',
              onClick: openLogin,
              sx: primaryButtonSx,
            },
            'Login',
          ),
          h(
            MuiButton,
            {
              fullWidth: true,
              size: 'large',
              variant: 'outlined',
              onClick: openSignup,
              sx: secondaryButtonSx,
            },
            'Signup',
          ),
        ),
      ),
    ),
    h(PrimitiveModal, {
      open: modalOpen,
      onClose: closeModal,
      title: modalTitle,
      description: modalDescription,
      dividers: true,
      maxWidth: 'xs',
      actions: modalActions,
      children: modalContent,
      paperSx: {
        color: '#ffffff',
        bgcolor: 'rgba(9, 10, 26, 0.96)',
        backgroundImage:
          'linear-gradient(135deg, rgba(246, 6, 111, 0.12), rgba(2, 35, 113, 0.22))',
        border: '1px solid rgba(246, 6, 111, 0.34)',
        boxShadow:
          '0 0 30px rgba(246, 6, 111, 0.22), 0 0 22px rgba(139, 233, 255, 0.1)',
      },
    }),
  );
}

export default LoginSignup;
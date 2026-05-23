import type { ButtonProps } from '@mui/material/Button';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

export type LoginSignupMode = 'login' | 'signup';

export type LoginSignupSuccessPayload = {
  mode: LoginSignupMode;
  response: unknown;
  username?: string;
  profileHref?: string;
};

export type LoginSignupBaseProps = {
  loginEndpoint?: string;
  signupEndpoint?: string;
  profileHrefPrefix?: string;
  onSuccess?: (payload: LoginSignupSuccessPayload) => void;
  sx?: SxProps<Theme>;
};

export type LoginSignupLabels = {
  title?: ReactNode;
  description?: ReactNode;

  loginButton?: ReactNode;
  signupButton?: ReactNode;

  loginTitle?: string;
  signupTitle?: string;

  loginDescription?: string;
  signupDescription?: string;

  cancelButton?: ReactNode;
  closeButton?: ReactNode;
  submitLoginButton?: ReactNode;
  submitSignupButton?: ReactNode;
  submittingButton?: ReactNode;

  loginSwitchPrompt?: ReactNode;
  signupSwitchPrompt?: ReactNode;
  loginSwitchButton?: ReactNode;
  signupSwitchButton?: ReactNode;

  usernameHelperText?: ReactNode;
  signupSuccessFallback?: string;
};

export interface LoginSignupProps extends LoginSignupBaseProps {
  defaultMode?: LoginSignupMode | null;
  labels?: LoginSignupLabels;

  hideIntro?: boolean;
  closeOnLoginSuccess?: boolean;
  closeOnSignupSuccess?: boolean;

  buttonSize?: ButtonProps['size'];
  modalMaxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';

  onError?: (error: unknown) => void;
  onOpen?: (mode: LoginSignupMode) => void;
  onClose?: () => void;

  rootSx?: SxProps<Theme>;
  formSx?: SxProps<Theme>;
  actionsSx?: SxProps<Theme>;
}

export type StatusState = {
  severity: 'success' | 'error';
  message: string;
};

export type LoginRequestBody = {
  identifier: string;
  password: string;
};

export type SignupRequestBody = {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  timezone?: string;
  locale?: string;
};

export type ParsedLoginForm = LoginRequestBody;

export type ParsedSignupForm = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type PostJsonOptions = Omit<RequestInit, 'body' | 'method'> & {
  method?: 'POST' | 'PUT' | 'PATCH';
};

export type BuildLoginSuccessPayloadOptions = {
  response: unknown;
  identifier: string;
  profileHrefPrefix: string;
};

export type BuildSignupSuccessPayloadOptions = {
  response: unknown;
  username: string;
  profileHrefPrefix: string;
};

export type SubmitLoginOptions = {
  endpoint: string;
  formData: FormData;
  profileHrefPrefix?: string;
};

export type SubmitSignupOptions = {
  endpoint: string;
  formData: FormData;
  profileHrefPrefix?: string;
};
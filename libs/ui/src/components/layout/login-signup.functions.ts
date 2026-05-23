// libs/ui/src/components/layout/login-signup.functions.ts

import { type SxProps, type Theme } from '@mui/material/styles';

import type {
  BrowserCookieOptions,
  BuildLoginSuccessPayloadOptions,
  BuildSignupSuccessPayloadOptions,
  LoginSignupLabels,
  LoginSignupMode,
  LoginSignupSuccessPayload,
  ParsedLoginForm,
  ParsedSignupForm,
  PostJsonOptions,
  SignupRequestBody,
  StatusState,
  SubmitLoginOptions,
  SubmitSignupOptions,
  UnknownRecord,
} from '../../types';

export const LOGIN_SIGNUP_DEFAULT_LOGIN_ENDPOINT = '/api/V1/auth/login';
export const LOGIN_SIGNUP_DEFAULT_SIGNUP_ENDPOINT = '/api/V1/auth/signup';
export const LOGIN_SIGNUP_DEFAULT_PROFILE_HREF_PREFIX = '/profile';

export const CURRENT_USERNAME_STORAGE_KEY = 'helix.currentUsername';
export const USERNAME_COOKIE_NAME = 'helix_username';
export const PERSISTED_USERNAME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USERNAME_RESPONSE_PATHS = [
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
  ['data', 'user', 'username'],
  ['data', 'profile', 'username'],
  ['username'],
  ['handle'],
  ['login'],
] as const;

export const loginSignupDefaultLabels = {
  title: 'Welcome to Helix AI',
  description: 'Log in or create an account to continue.',

  loginButton: 'Login',
  signupButton: 'Signup',

  loginTitle: 'Log in',
  signupTitle: 'Create your account',

  loginDescription: 'Log in to your Helix AI account.',
  signupDescription: 'Create a Helix AI account to continue.',

  cancelButton: 'Cancel',
  closeButton: 'Close',
  submitLoginButton: 'Login',
  submitSignupButton: 'Signup',
  submittingButton: 'Submitting...',

  loginSwitchPrompt: 'Need an account?',
  signupSwitchPrompt: 'Already have an account?',
  loginSwitchButton: 'Signup',
  signupSwitchButton: 'Login',

  usernameHelperText: 'Use 3-32 letters, numbers, dots, underscores, or hyphens.',
  signupSuccessFallback:
    'Account created. Check your email to verify your account.',
} satisfies Required<LoginSignupLabels>;

export const primaryButtonSx: SxProps<Theme> = {
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

export const secondaryButtonSx: SxProps<Theme> = {
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

export const textButtonSx: SxProps<Theme> = {
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

export const fieldSx: SxProps<Theme> = {
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

export function getModalTitle(
  mode: LoginSignupMode | null,
  labels: Required<LoginSignupLabels>,
): string {
  return mode === 'signup' ? labels.signupTitle : labels.loginTitle;
}

export function getModalDescription(
  mode: LoginSignupMode | null,
  labels: Required<LoginSignupLabels>,
): string {
  return mode === 'signup'
    ? labels.signupDescription
    : labels.loginDescription;
}

export function getStatusAlertSx(
  severity: StatusState['severity'],
): SxProps<Theme> {
  return {
    borderRadius: 2,
    border:
      severity === 'success'
        ? '1px solid rgba(139, 233, 255, 0.32)'
        : '1px solid rgba(246, 6, 111, 0.24)',
    backgroundColor:
      severity === 'success'
        ? 'rgba(139, 233, 255, 0.1)'
        : 'rgba(246, 6, 111, 0.1)',
    color: '#ffffff',
  };
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readNestedValue(
  value: unknown,
  path: readonly string[],
): unknown {
  let current = value;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

export function readNestedString(
  value: unknown,
  paths: readonly (readonly string[])[],
): string | undefined {
  for (const path of paths) {
    const candidate = readNestedValue(value, path);

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }

  return undefined;
}

export function unwrapApiResponse(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if (value.success === true && 'data' in value) {
    return value.data;
  }

  if (value.ok === true && 'data' in value) {
    return value.data;
  }

  return value;
}

export function extractUsernameFromResponse(value: unknown): string | undefined {
  const data = unwrapApiResponse(value);

  return readNestedString(data, USERNAME_RESPONSE_PATHS);
}

export function looksLikeEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function normalizeUsernameCandidate(value: string): string | undefined {
  const username = value.trim();

  if (!username || looksLikeEmail(username)) {
    return undefined;
  }

  return username;
}

export function normalizeSignupUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateSignupUsername(username: string): void {
  if (!USERNAME_REGEX.test(username)) {
    throw new Error(
      'User name must be 3-32 characters and may only use letters, numbers, dots, underscores, or hyphens. It must start and end with a letter or number.',
    );
  }
}

export function validateEmail(email: string): void {
  if (!looksLikeEmail(email)) {
    throw new Error('A valid email address is required.');
  }
}

export function validateLoginForm(form: ParsedLoginForm): void {
  if (!form.identifier.trim() || !form.password) {
    throw new Error('Email or user name and password are required.');
  }
}

export function validateSignupForm(form: ParsedSignupForm): void {
  if (
    !form.username ||
    !form.displayName ||
    !form.email ||
    !form.password ||
    !form.confirmPassword
  ) {
    throw new Error(
      'User name, name, email, password, and password confirmation are required.',
    );
  }

  validateSignupUsername(form.username);
  validateEmail(form.email);

  if (form.password !== form.confirmPassword) {
    throw new Error('Passwords do not match.');
  }
}

export function buildProfileHref(
  profileHrefPrefix: string,
  username: string | undefined,
): string | undefined {
  const normalizedUsername = username?.trim();

  if (!normalizedUsername) {
    return undefined;
  }

  const normalizedPrefix = profileHrefPrefix.trim() || '/profile';

  if (normalizedPrefix.includes('{username}')) {
    return normalizedPrefix.replaceAll(
      '{username}',
      encodeURIComponent(normalizedUsername),
    );
  }

  if (normalizedPrefix.includes(':username')) {
    return normalizedPrefix.replaceAll(
      ':username',
      encodeURIComponent(normalizedUsername),
    );
  }

  return `${normalizedPrefix.replace(/\/+$/, '')}/${encodeURIComponent(
    normalizedUsername,
  )}`;
}

export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const encodedName = encodeURIComponent(name);
  const cookies = document.cookie
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const rawName = cookie.slice(0, separatorIndex).trim();
    const cookieName = safeDecodeURIComponent(rawName);

    if (cookieName !== name && rawName !== encodedName) {
      continue;
    }

    return (
      safeDecodeURIComponent(cookie.slice(separatorIndex + 1)).trim() || null
    );
  }

  return null;
}

export function writeBrowserCookie(
  name: string,
  value: string,
  options: BrowserCookieOptions = {},
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const {
    path = '/',
    domain,
    maxAgeSeconds = PERSISTED_USERNAME_MAX_AGE_SECONDS,
    sameSite = 'Lax',
    secure = sameSite === 'None',
  } = options;

  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${sameSite}`,
  ];

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  if (secure) {
    parts.push('Secure');
  }

  document.cookie = parts.join('; ');
}

export function deleteBrowserCookie(
  name: string,
  options: Pick<BrowserCookieOptions, 'path' | 'domain' | 'sameSite'> = {},
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const { path = '/', domain, sameSite = 'Lax' } = options;

  const parts = [
    `${encodeURIComponent(name)}=`,
    `Path=${path}`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    `SameSite=${sameSite}`,
  ];

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  document.cookie = parts.join('; ');
}

export function readLocalStorageUsername(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(CURRENT_USERNAME_STORAGE_KEY);

    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function readPersistedUsername(): string | null {
  return readBrowserCookie(USERNAME_COOKIE_NAME) ?? readLocalStorageUsername();
}

export function persistUsername(username: string | undefined): void {
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

export function clearPersistedUsername(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(CURRENT_USERNAME_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }

  deleteBrowserCookie(USERNAME_COOKIE_NAME);
}

export async function readApiResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function getApiMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  if (isRecord(data)) {
    const message = data.message ?? data.error ?? data.detail ?? data.title;

    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }

    for (const key of ['data', 'error', 'errors', 'verification']) {
      const nested = data[key];

      if (isRecord(nested)) {
        const nestedMessage = getApiMessage(nested, '');

        if (nestedMessage) {
          return nestedMessage;
        }
      }
    }
  }

  return fallback;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'Something went wrong. Please try again.';
}

export function getBrowserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function getBrowserLocale(): string | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  return navigator.language || undefined;
}

export function readFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);

  if (typeof value !== 'string') {
    return '';
  }

  return value;
}

export function parseLoginFormData(formData: FormData): ParsedLoginForm {
  const form = {
    identifier: readFormValue(formData, 'identifier').trim(),
    password: readFormValue(formData, 'password'),
  };

  validateLoginForm(form);

  return form;
}

export function parseSignupFormData(formData: FormData): ParsedSignupForm {
  const form = {
    username: normalizeSignupUsername(readFormValue(formData, 'username')),
    displayName: readFormValue(formData, 'displayName').trim(),
    email: readFormValue(formData, 'email').trim().toLowerCase(),
    password: readFormValue(formData, 'password'),
    confirmPassword: readFormValue(formData, 'confirmPassword'),
  };

  validateSignupForm(form);

  return form;
}

export function buildSignupRequestBody(
  form: ParsedSignupForm,
): SignupRequestBody {
  const body: SignupRequestBody = {
    username: form.username,
    email: form.email,
    password: form.password,
    displayName: form.displayName,
  };

  const timezone = getBrowserTimezone();
  const locale = getBrowserLocale();

  if (timezone) {
    body.timezone = timezone;
  }

  if (locale) {
    body.locale = locale;
  }

  return body;
}

export function buildLoginSuccessPayload({
  response,
  identifier,
  profileHrefPrefix,
}: BuildLoginSuccessPayloadOptions): LoginSignupSuccessPayload {
  const username =
    extractUsernameFromResponse(response) ??
    normalizeUsernameCandidate(identifier);

  const profileHref = buildProfileHref(profileHrefPrefix, username);

  persistUsername(username);

  return {
    mode: 'login',
    response,
    ...(username === undefined ? {} : { username }),
    ...(profileHref === undefined ? {} : { profileHref }),
  };
}

export function buildSignupSuccessPayload({
  response,
  username,
  profileHrefPrefix,
}: BuildSignupSuccessPayloadOptions): LoginSignupSuccessPayload {
  const responseUsername = extractUsernameFromResponse(response) ?? username;
  const profileHref = buildProfileHref(profileHrefPrefix, responseUsername);

  persistUsername(responseUsername);

  return {
    mode: 'signup',
    response,
    username: responseUsername,
    ...(profileHref === undefined ? {} : { profileHref }),
  };
}

export async function postJson(
  endpoint: string,
  body: unknown,
  options: PostJsonOptions = {},
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: options.method ?? 'POST',
    credentials: 'include',
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
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

export async function submitLogin({
  endpoint,
  formData,
  profileHrefPrefix = LOGIN_SIGNUP_DEFAULT_PROFILE_HREF_PREFIX,
}: SubmitLoginOptions): Promise<LoginSignupSuccessPayload> {
  const form = parseLoginFormData(formData);
  const response = await postJson(endpoint, form);

  return buildLoginSuccessPayload({
    response,
    identifier: form.identifier,
    profileHrefPrefix,
  });
}

export async function submitSignup({
  endpoint,
  formData,
  profileHrefPrefix = LOGIN_SIGNUP_DEFAULT_PROFILE_HREF_PREFIX,
}: SubmitSignupOptions): Promise<LoginSignupSuccessPayload> {
  const form = parseSignupFormData(formData);
  const body = buildSignupRequestBody(form);
  const response = await postJson(endpoint, body);

  return buildSignupSuccessPayload({
    response,
    username: form.username,
    profileHrefPrefix,
  });
}
import type { UserProfileMenuUser } from '../profile/user-profile-menu';
import type {
  ActivePathOptions,
  BrowserCookieOptions,
  HeaderUserResolution,
  HeaderUserResolutionOptions,
  UnknownRecord,
} from '../../types';

export const CURRENT_USERNAME_STORAGE_KEY = 'helix.currentUsername';
export const USERNAME_COOKIE_NAME = 'helix_username';
export const PERSISTED_USERNAME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const MAX_EXTRACT_DEPTH = 6;

const USERNAME_KEYS = [
  'username',
  'handle',
  'login',
  'userName',
  'user_name',
  'preferred_username',
  'nickname',
] as const;

const USER_ID_KEYS = ['id', 'userId', 'user_id', 'sub', 'subject'] as const;

const NAME_KEYS = ['name', 'fullName', 'full_name'] as const;

const DISPLAY_NAME_KEYS = [
  'displayName',
  'display_name',
  'display',
  'label',
] as const;

const EMAIL_KEYS = ['email', 'emailAddress', 'email_address'] as const;

const AVATAR_KEYS = [
  'avatarUrl',
  'avatar_url',
  'avatar',
  'image',
  'picture',
  'photo',
  'photoUrl',
  'photo_url',
] as const;

const NESTED_USER_KEYS = [
  'user',
  'currentUser',
  'profile',
  'account',
  'member',
  'principal',
  'identity',
  'session',
  'auth',
  'data',
  'payload',
  'result',
] as const;

export function normalizeVersion(
  version: string | number | null | undefined,
): string {
  if (version === null || version === undefined) {
    return '';
  }

  return String(version).trim().replace(/^v/i, '');
}

export function normalizePathname(value: string): string {
  const [withoutHash] = value.split('#');
  const [withoutQuery] = withoutHash.split('?');

  if (!withoutQuery) {
    return '/';
  }

  const pathname = withoutQuery.startsWith('/')
    ? withoutQuery
    : `/${withoutQuery}`;

  if (pathname === '/') {
    return pathname;
  }

  return pathname.replace(/\/+$/, '');
}

export function isExternalUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url);
}

export function isActivePath(
  pathname: string | null | undefined,
  url: string,
  options: ActivePathOptions | boolean = {},
): boolean {
  if (!pathname || !url || isExternalUrl(url)) {
    return false;
  }

  const resolvedOptions =
    typeof options === 'boolean' ? { exact: options } : options;

  const exact = resolvedOptions.exact ?? false;
  const includeChildren = resolvedOptions.includeChildren ?? !exact;

  const currentPath = normalizePathname(pathname);
  const targetPath = normalizePathname(url);

  if (targetPath === '/') {
    return currentPath === '/';
  }

  if (exact) {
    return currentPath === targetPath;
  }

  return (
    currentPath === targetPath ||
    (includeChildren && currentPath.startsWith(`${targetPath}/`))
  );
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(
  record: UnknownRecord,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
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

    const rawCookieName = cookie.slice(0, separatorIndex).trim();
    const cookieName = safeDecodeURIComponent(rawCookieName);

    if (cookieName !== name && rawCookieName !== encodedName) {
      continue;
    }

    const cookieValue = cookie.slice(separatorIndex + 1);

    return safeDecodeURIComponent(cookieValue).trim() || null;
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

export function persistUsername(username: string | null | undefined): void {
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
    // Ignore storage failures. The cookie is still enough for hydration.
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

export function normalizeUserRecord(
  record: UnknownRecord,
): UserProfileMenuUser | null {
  const id = readString(record, USER_ID_KEYS);
  const username = readString(record, USERNAME_KEYS);
  const name = readString(record, NAME_KEYS);
  const displayName = readString(record, DISPLAY_NAME_KEYS);
  const email = readString(record, EMAIL_KEYS);
  const avatarUrl = readString(record, AVATAR_KEYS);

  if (!id && !username && !name && !displayName && !email) {
    return null;
  }

  const resolvedDisplayName =
    displayName ?? name ?? username ?? email ?? 'Account';

  return {
    ...record,
    id: id ?? username ?? email ?? resolvedDisplayName,
    name: name ?? resolvedDisplayName,
    displayName: resolvedDisplayName,
    email: email ?? null,
    username: username ?? null,
    handle: username ?? null,
    login: username ?? null,
    userName: username ?? null,
    user_name: username ?? null,
    avatarUrl: avatarUrl ?? null,
    avatar: avatarUrl ?? null,
    image: avatarUrl ?? null,
    picture: avatarUrl ?? null,
  } as unknown as UserProfileMenuUser;
}

export function extractUserFromUnknown(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): UserProfileMenuUser | null {
  if (!isRecord(value) || depth > MAX_EXTRACT_DEPTH) {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  const directUser = normalizeUserRecord(value);

  if (directUser) {
    return directUser;
  }

  for (const key of NESTED_USER_KEYS) {
    const nestedUser = extractUserFromUnknown(value[key], depth + 1, seen);

    if (nestedUser) {
      return nestedUser;
    }
  }

  return null;
}

export function extractUsernameFromUnknown(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): string | null {
  if (!isRecord(value) || depth > MAX_EXTRACT_DEPTH) {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  const directUsername = readString(value, USERNAME_KEYS);

  if (directUsername) {
    return directUsername;
  }

  for (const key of NESTED_USER_KEYS) {
    const nestedUsername = extractUsernameFromUnknown(
      value[key],
      depth + 1,
      seen,
    );

    if (nestedUsername) {
      return nestedUsername;
    }
  }

  return null;
}

export function resolveUsername(
  user: UserProfileMenuUser | null | undefined,
  fallbackToPersistedUsername = false,
): string | null {
  const username = isRecord(user) ? readString(user, USERNAME_KEYS) : undefined;

  return username ?? (fallbackToPersistedUsername ? readPersistedUsername() : null);
}

export function createAuthenticatedFallbackUser(
  username?: string | null,
): UserProfileMenuUser {
  const resolvedUsername = username?.trim() || null;
  const displayName = resolvedUsername ?? 'Account';

  return {
    id: resolvedUsername ?? 'authenticated-user',
    name: displayName,
    displayName,
    username: resolvedUsername,
    handle: resolvedUsername,
    login: resolvedUsername,
    userName: resolvedUsername,
    user_name: resolvedUsername,
    email: null,
    avatarUrl: null,
    avatar: null,
    image: null,
    picture: null,
  };
}

export function resolveHeaderUser(
  value: unknown,
  options: HeaderUserResolutionOptions = {},
): HeaderUserResolution {
  const {
    persist = true,
    fallbackToPersistedUsername = true,
    createFallbackUser = true,
  } = options;

  const extractedUser = extractUserFromUnknown(value);
  const extractedUsername =
    extractUsernameFromUnknown(value) ??
    resolveUsername(extractedUser) ??
    (fallbackToPersistedUsername ? readPersistedUsername() : null);

  const user =
    extractedUser ??
    (createFallbackUser && extractedUsername
      ? createAuthenticatedFallbackUser(extractedUsername)
      : null);

  const username = resolveUsername(user) ?? extractedUsername;

  if (persist && username) {
    persistUsername(username);
  }

  return {
    user,
    username,
    authenticated: Boolean(user || username),
  };
}

export function buildUserProfileUrl(
  endpoint: string,
  username: string | null | undefined,
): string {
  const normalizedEndpoint = endpoint.trim() || '/profile';
  const normalizedUsername = username?.trim();

  if (!normalizedUsername) {
    return (
      normalizedEndpoint
        .replace(/\/?\{username\}/g, '')
        .replace(/\/?:username/g, '')
        .replace(/\/+$/, '') || '/profile'
    );
  }

  const safeUsername = encodeURIComponent(normalizedUsername);

  if (normalizedEndpoint.includes('{username}')) {
    return normalizedEndpoint.replaceAll('{username}', safeUsername);
  }

  if (normalizedEndpoint.includes(':username')) {
    return normalizedEndpoint.replaceAll(':username', safeUsername);
  }

  if (normalizedEndpoint.endsWith(`/${safeUsername}`)) {
    return normalizedEndpoint;
  }

  return `${normalizedEndpoint.replace(/\/+$/, '')}/${safeUsername}`;
}

export async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function getResponseMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  if (!isRecord(data)) {
    return fallback;
  }

  const directMessage = readString(data, [
    'message',
    'error',
    'detail',
    'title',
    'reason',
  ]);

  if (directMessage) {
    return directMessage;
  }

  for (const key of ['data', 'error', 'errors', 'verification']) {
    const nested = data[key];

    if (isRecord(nested)) {
      const nestedMessage = getResponseMessage(nested, '');

      if (nestedMessage) {
        return nestedMessage;
      }
    }
  }

  return fallback;
}

export function isUnauthorizedResponse(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

export async function fetchJson(
  endpoint: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(endpoint, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });

  const data = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      getResponseMessage(data, `Request failed with status ${response.status}.`),
    );
  }

  return data;
}

export async function postJson(
  endpoint: string,
  body?: unknown,
  init: RequestInit = {},
): Promise<unknown> {
  return fetchJson(endpoint, {
    ...init,
    method: init.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    body: body === undefined ? init.body : JSON.stringify(body),
  });
}

export async function postLogout(endpoint: string): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    credentials: 'include',
  });

  const data = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      getResponseMessage(data, `Logout failed with status ${response.status}.`),
    );
  }

  clearPersistedUsername();

  return data;
}

import { alpha, type SxProps, type Theme } from '@mui/material/styles';

export function getMobileNavListSx(
  open: boolean,
  theme: Theme,
): SxProps<Theme> {
  return {
    display: open ? { xs: 'flex', md: 'none' } : 'none',

    position: 'absolute',
    top: 'calc(100% + 0.75rem)',
    right: { xs: '0.25rem', sm: '0.5rem' },

    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '1rem',

    minWidth: 'min(18rem, calc(100vw - 2rem))',
    p: '1rem 1.5rem',
    m: 0,

    listStyle: 'none',

    color: '#ffffff',
    background: 'rgba(2, 35, 113, 0.92)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: '0.75rem',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',

    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',

    '& li': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'stretch',
    },

    '& li > .MuiButton-root': {
      width: '100%',
      justifyContent: 'flex-start',
      textAlign: 'left',
    },

    '& li[data-auth-control="true"]': {
      pt: 0.5,
      borderTop: `1px solid ${alpha(theme.palette.common.white, 0.14)}`,
    },
  };
}
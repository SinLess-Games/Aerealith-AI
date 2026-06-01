import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';

import { ProfileDashboard } from '@aerealith-ai/ui';
import type {
  PrivateUserProfileDashboardDto,
  UserServiceUserId,
  UserServiceUsername,
} from '@aerealith-ai/contracts';

import { getFrontendFeatureFlags } from '../../../lib/feature-flags';

type PrivateProfileResponse = {
  ok: boolean;
  data?: PrivateUserProfileDashboardDto;
};

const COOKIE = {
  ACCESS_TOKEN: 'helix_access_token',
  REFRESH_TOKEN: 'helix_refresh_token',
  SESSION_ID: 'helix_session_id',
  USERNAME: 'helix_username',
} as const;

const DEFAULT_USER_SERVICE_PROFILE_PATH_PREFIX = '/api/V1/users';
const DEFAULT_USER_SERVICE_URL = 'http://localhost:8788';
const DEFAULT_USER_SERVICE_TIMEOUT_MS =
  process.env.NODE_ENV === 'development' ? 5_000 : 2_500;

function createUnavailablePrivateProfile(
  username: string,
): PrivateUserProfileDashboardDto {
  const now = new Date().toISOString();
  const unavailableId = `unavailable:${username}` as UserServiceUserId;
  const unavailableUsername = username as UserServiceUsername;

  return {
    profile: {
      id: `unavailable:${username}`,
      userId: unavailableId,
      username: unavailableUsername,
      handle: username,
      displayName: username,
      givenName: null,
      middleName: null,
      familyName: null,
      pronouns: null,
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
      status: null,
      visibility: 'private',
      fieldVisibility: null,
      locationLabel: null,
      country: null,
      gender: null,
      sex: null,
      sexuality: null,
      primaryLanguage: null,
      languages: null,
      locale: null,
      timezone: null,
      timezoneUtc: null,
      timezoneGreenwich: null,
      weekStartDay: null,
      dateFormat: null,
      timeFormat: null,
      nameDisplayOrder: null,
      measurementSystem: null,
      contentMaturity: null,
      websiteUrl: null,
      links: null,
      createdAt: now,
      updatedAt: now,
    },
    stats: {
      achievements: 0,
      appConnections: 0,
      files: 0,
      integrations: 0,
      reports: 0,
      totalPoints: 0,
    },
    achievements: [],
    appConnections: [],
    integrations: [],
    files: [],
    reports: [],
    activity: [],
  };
}

function getUserServiceTimeoutMs(): number {
  const value = Number(process.env.USER_SERVICE_TIMEOUT_MS);

  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_USER_SERVICE_TIMEOUT_MS;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isFetchNetworkError(error: unknown): boolean {
  return error instanceof TypeError && error.message === 'fetch failed';
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return normalizeLoopbackUrl(`${normalizedBaseUrl}${normalizedPath}`);
}

function normalizeLoopbackUrl(value: string): string {
  if (process.env.NODE_ENV !== 'development') {
    return value;
  }

  try {
    const url = new URL(value);

    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
    }

    return url.toString();
  } catch {
    return value;
  }
}

function getPrivateProfileUrl(username: string): string {
  const userServiceUrl =
    process.env.USER_SERVICE_INTERNAL_URL ??
    process.env.USER_SERVICE_URL ??
    DEFAULT_USER_SERVICE_URL;
  const profilePathPrefix =
    process.env.USER_SERVICE_BASE_PATH ??
    DEFAULT_USER_SERVICE_PROFILE_PATH_PREFIX;

  return joinUrl(
    userServiceUrl,
    `${profilePathPrefix}/${encodeURIComponent(username)}/profile/dashboard`,
  );
}

async function getPrivateProfile(
  username: string,
): Promise<PrivateUserProfileDashboardDto> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    getUserServiceTimeoutMs(),
  );

  let response: Response;

  try {
    response = await fetch(getPrivateProfileUrl(username), {
      headers: {
        Accept: 'application/json',
        'x-aerealith-auth-username': username,
        'x-helix-username': username,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (
      process.env.NODE_ENV === 'development' &&
      (isAbortError(error) || isFetchNetworkError(error))
    ) {
      return createUnavailablePrivateProfile(username);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401) {
    redirect('/login');
  }

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error('Unable to fetch private profile dashboard.');
  }

  const body = (await response.json()) as PrivateProfileResponse;

  if (!body.ok || !body.data) {
    if (process.env.NODE_ENV === 'development') {
      return createUnavailablePrivateProfile(username);
    }

    throw new Error(
      'User service returned an invalid private profile dashboard.',
    );
  }

  return body.data;
}

export default async function PrivateProfilePage() {
  const cookieStore = await cookies();
  const username = cookieStore.get(COOKIE.USERNAME)?.value;
  const hasSession = Boolean(
    cookieStore.get(COOKIE.SESSION_ID)?.value ||
    cookieStore.get(COOKIE.ACCESS_TOKEN)?.value ||
    cookieStore.get(COOKIE.REFRESH_TOKEN)?.value,
  );
  const featureFlags = await getFrontendFeatureFlags();

  if (!featureFlags.profile || !featureFlags['profile-private']) {
    notFound();
  }

  if (!hasSession || !username) {
    redirect('/login');
  }

  const profile = await getPrivateProfile(username);

  return (
    <ProfileDashboard data={profile} flags={featureFlags} mode="private" />
  );
}

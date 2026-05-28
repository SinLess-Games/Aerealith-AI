import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ProfilePage } from '@aerealith-ai/ui';
import { profileScaffoldContent } from '@aerealith-ai/content';
import type {
  ProfileCardProfile,
  ProfileIdentityScaffold,
  SettingsCardSettings,
  ProfileViewMode,
} from '@aerealith-ai/ui';

import { getFrontendFeatureFlags } from '../../../lib/feature-flags';

type ProfilePageRouteProps = {
  params: Promise<{
    username: string;
  }>;
};

type UserServiceProfileResponse = {
  ok: boolean;
  data?: ProfileCardProfile & {
    username: string;
    displayName?: string | null;
    createdAt?: string;
  };
};

type UserServiceSettingsResponse = {
  ok: boolean;
  data?: SettingsCardSettings;
};

const SESSION_COOKIE_NAMES = [
  'helix_session_id',
  'helix_refresh_token',
  'helix_access_token',
] as const;

const DEFAULT_USER_SERVICE_PROFILE_PATH_PREFIX = '/api/V1/users';
const DEFAULT_USER_SERVICE_URL = 'http://localhost:8788';

function decodeUsername(username: string): string {
  try {
    return decodeURIComponent(username);
  } catch {
    return username;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

function getUserProfileUrl(username: string): string {
  const encodedUsername = encodeURIComponent(username);
  const explicitProfileUrl = process.env.USER_SERVICE_PROFILE_URL;

  if (explicitProfileUrl) {
    return explicitProfileUrl.replace('{username}', encodedUsername);
  }

  const userServiceUrl =
    process.env.USER_SERVICE_INTERNAL_URL ??
    process.env.USER_SERVICE_URL ??
    DEFAULT_USER_SERVICE_URL;
  const profilePathPrefix =
    process.env.USER_SERVICE_BASE_PATH ??
    DEFAULT_USER_SERVICE_PROFILE_PATH_PREFIX;

  return joinUrl(userServiceUrl, `${profilePathPrefix}/${encodedUsername}/profile`);
}

function getUserSettingsUrl(username: string): string {
  const encodedUsername = encodeURIComponent(username);
  const userServiceUrl =
    process.env.USER_SERVICE_INTERNAL_URL ??
    process.env.USER_SERVICE_URL ??
    DEFAULT_USER_SERVICE_URL;
  const settingsPathPrefix =
    process.env.USER_SERVICE_BASE_PATH ??
    DEFAULT_USER_SERVICE_PROFILE_PATH_PREFIX;

  return joinUrl(userServiceUrl, `${settingsPathPrefix}/${encodedUsername}/settings`);
}

async function getProfileViewMode(): Promise<ProfileViewMode> {
  const cookieStore = await cookies();
  const hasSession = SESSION_COOKIE_NAMES.some((name) =>
    Boolean(cookieStore.get(name)?.value),
  );

  return hasSession ? 'private' : 'public';
}

async function getUserProfile(
  username: string,
): Promise<UserServiceProfileResponse['data']> {
  const response = await fetch(getUserProfileUrl(username), {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error(`Unable to fetch profile for ${username}.`);
  }

  const body = (await response.json()) as UserServiceProfileResponse;

  if (!body.ok || !body.data) {
    throw new Error(`User service returned an invalid profile for ${username}.`);
  }

  return body.data;
}

async function getUserSettings(
  username: string,
): Promise<UserServiceSettingsResponse['data']> {
  const response = await fetch(getUserSettingsUrl(username), {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Unable to fetch settings for ${username}.`);
  }

  const body = (await response.json()) as UserServiceSettingsResponse;

  if (!body.ok || !body.data) {
    throw new Error(`User service returned invalid settings for ${username}.`);
  }

  return body.data;
}

function createIdentity(profile: UserServiceProfileResponse['data']): ProfileIdentityScaffold {
  if (!profile) {
    return {};
  }

  return {
    username: profile.displayName ?? profile.username,
    handle: profile.handle,
    initials: (profile.displayName ?? profile.username).slice(0, 2).toUpperCase(),
    bio: profile.bio ?? undefined,
    location: profile.locationLabel ?? undefined,
    website: profile.websiteUrl ?? undefined,
    joined: profile.createdAt ?? undefined,
  };
}

export default async function UserProfilePage({
  params,
}: ProfilePageRouteProps) {
  const { username } = await params;
  const decodedUsername = decodeUsername(username);
  const mode = await getProfileViewMode();
  const featureFlags = await getFrontendFeatureFlags();

  if (!featureFlags.dashboard) {
    notFound();
  }

  const profile = await getUserProfile(decodedUsername);
  const settings =
    mode === 'private' ? await getUserSettings(decodedUsername) : undefined;

  return (
    <ProfilePage
      content={profileScaffoldContent}
      identity={createIdentity(profile)}
      profile={profile}
      settings={settings}
      activeTab="overview"
      mode={mode}
      dashboardHref="/dashboard"
    />
  );
}

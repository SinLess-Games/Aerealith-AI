import type { GithubConfig } from '../types/github';

import {
  defaultGithubActionsTokenConfig,
  defaultGithubAppConfig,
  defaultGithubConfig,
  defaultGithubOAuthConfig,
  defaultLocalGithubConfig,
} from '../defaults/github.defaults';
import { githubSchema } from '../schema/github.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvList,
  resolveAppEnvironment,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type GithubConfigProfile =
  | 'default'
  | 'local'
  | 'oauth'
  | 'github-app'
  | 'actions-token'
  | 'auto';

export type ResolvedGithubConfigProfile = Exclude<GithubConfigProfile, 'auto'>;

export type GithubConfigOptions = {
  name?: string;
  profile?: GithubConfigProfile;
  defaults?: GithubConfig;
};

export function createGithubConfig(
  env: EnvRecord = {},
  options: GithubConfigOptions = {},
): GithubConfig {
  const configName = options.name ?? 'github config';
  const profile = resolveGithubConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveGithubConfigDefaults(profile);
  const overrides = buildGithubConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(githubSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function buildGithubConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootGithubOverrides(env, overrides);
  applyRepositoryOverrides(env, overrides);
  applyOAuthOverrides(env, overrides);
  applyGithubAppOverrides(env, overrides);
  applyApiOverrides(env, overrides);
  applyDerivedGithubOverrides(env, overrides);

  return overrides;
}

export function resolveGithubConfigProfile(
  env: EnvRecord,
  profile: GithubConfigProfile = 'auto',
): ResolvedGithubConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const explicitAuthMode = getEnv(env, 'GITHUB_AUTH_MODE');

  if (explicitAuthMode === 'github-app') {
    return 'github-app';
  }

  if (explicitAuthMode === 'oauth-app') {
    return 'oauth';
  }

  if (
    explicitAuthMode === 'personal-access-token' ||
    explicitAuthMode === 'actions-token'
  ) {
    return 'actions-token';
  }

  if (hasGithubAppSignal(env)) {
    return 'github-app';
  }

  if (hasGithubActionsTokenSignal(env)) {
    return 'actions-token';
  }

  if (hasGithubOAuthSignal(env)) {
    return 'oauth';
  }

  const environment = resolveAppEnvironment(env);

  if (environment === 'development' || environment === 'test') {
    return 'local';
  }

  return 'default';
}

export function resolveGithubConfigDefaults(
  profile: ResolvedGithubConfigProfile,
): GithubConfig {
  if (profile === 'github-app') {
    return deepClone(defaultGithubAppConfig);
  }

  if (profile === 'oauth') {
    return deepClone(defaultGithubOAuthConfig);
  }

  if (profile === 'actions-token') {
    return deepClone(defaultGithubActionsTokenConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalGithubConfig);
  }

  return deepClone(defaultGithubConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createGithubConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const githubConfig = createGithubConfig();

export default githubConfig;

function applyRootGithubOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'GITHUB_ENABLED', 'enabled');
  applyOptionalString(env, overrides, 'GITHUB_AUTH_MODE', 'authMode');

  applyOptionalString(env, overrides, 'GITHUB_CLIENT_ID', 'clientId');
  applyOptionalString(env, overrides, 'GITHUB_REDIRECT_URI', 'redirectUri');

  applyOptionalString(env, overrides, 'GITHUB_REPO_URL', 'repoUrl');
}

function applyRepositoryOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const repositoryFullName =
    getEnv(env, 'GITHUB_REPOSITORY') ??
    getEnv(env, 'GITHUB_REPOSITORY_FULL_NAME');

  const repositoryOwner =
    getEnv(env, 'GITHUB_REPOSITORY_OWNER') ??
    repositoryFullName?.split('/')[0];

  const repositoryName =
    getEnv(env, 'GITHUB_REPOSITORY_NAME') ??
    repositoryFullName?.split('/')[1];

  if (repositoryOwner !== undefined) {
    setDeepValue(overrides, 'repository.owner', repositoryOwner);
  }

  if (repositoryName !== undefined) {
    setDeepValue(overrides, 'repository.name', repositoryName);
  }

  if (repositoryFullName !== undefined) {
    setDeepValue(overrides, 'repository.fullName', repositoryFullName);
  }

  const repoUrl =
    getEnv(env, 'GITHUB_REPOSITORY_URL') ??
    getEnv(env, 'GITHUB_REPO_URL') ??
    (repositoryFullName !== undefined
      ? `https://github.com/${repositoryFullName}`
      : undefined);

  if (repoUrl !== undefined) {
    setDeepValue(overrides, 'repoUrl', repoUrl);
    setDeepValue(overrides, 'repository.url', repoUrl);
  }

  applyOptionalString(
    env,
    overrides,
    'GITHUB_DEFAULT_BRANCH',
    'repository.defaultBranch',
  );

  applyOptionalString(
    env,
    overrides,
    'GITHUB_REPOSITORY_VISIBILITY',
    'repository.visibility',
  );
}

function applyOAuthOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalString(env, overrides, 'GITHUB_CLIENT_ID', 'oauth.clientId');
  applyOptionalString(
    env,
    overrides,
    'GITHUB_CLIENT_SECRET_REF',
    'oauth.clientSecretRef',
  );
  applyOptionalString(
    env,
    overrides,
    'GITHUB_REDIRECT_URI',
    'oauth.redirectUri',
  );
  applyOptionalList(env, overrides, 'GITHUB_OAUTH_SCOPES', 'oauth.scopes');

  if (hasGithubOAuthSignal(env)) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'authMode', 'oauth-app');

    if (getEnv(env, 'GITHUB_CLIENT_SECRET_REF') === undefined) {
      setDeepValue(overrides, 'oauth.clientSecretRef', 'GITHUB_CLIENT_SECRET');
    }
  }
}

function applyGithubAppOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalString(env, overrides, 'GITHUB_APP_ID', 'app.appId');
  applyOptionalString(env, overrides, 'GITHUB_APP_CLIENT_ID', 'app.clientId');
  applyOptionalString(
    env,
    overrides,
    'GITHUB_APP_CLIENT_SECRET_REF',
    'app.clientSecretRef',
  );
  applyOptionalString(
    env,
    overrides,
    'GITHUB_APP_INSTALLATION_ID',
    'app.installationId',
  );
  applyOptionalString(
    env,
    overrides,
    'GITHUB_APP_PRIVATE_KEY_REF',
    'app.privateKeyRef',
  );
  applyOptionalString(
    env,
    overrides,
    'GITHUB_APP_WEBHOOK_SECRET_REF',
    'app.webhookSecretRef',
  );

  applyGithubPermissionOverride(env, overrides, 'actions');
  applyGithubPermissionOverride(env, overrides, 'administration');
  applyGithubPermissionOverride(env, overrides, 'checks');
  applyGithubPermissionOverride(env, overrides, 'contents');
  applyGithubPermissionOverride(env, overrides, 'deployments');
  applyGithubPermissionOverride(env, overrides, 'issues');
  applyGithubPermissionOverride(env, overrides, 'metadata');
  applyGithubPermissionOverride(env, overrides, 'pull_requests');
  applyGithubPermissionOverride(env, overrides, 'statuses');
  applyGithubPermissionOverride(env, overrides, 'workflows');

  if (hasGithubAppSignal(env)) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'authMode', 'github-app');

    if (getEnv(env, 'GITHUB_APP_PRIVATE_KEY_REF') === undefined) {
      setDeepValue(overrides, 'app.privateKeyRef', 'GITHUB_APP_PRIVATE_KEY');
    }

    if (getEnv(env, 'GITHUB_APP_WEBHOOK_SECRET_REF') === undefined) {
      setDeepValue(overrides, 'app.webhookSecretRef', 'GITHUB_WEBHOOK_SECRET');
    }
  }
}

function applyApiOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalString(env, overrides, 'GITHUB_API_BASE_URL', 'api.baseUrl');
  applyOptionalString(env, overrides, 'GITHUB_WEB_URL', 'api.webUrl');
  applyOptionalString(env, overrides, 'GITHUB_TOKEN_REF', 'api.tokenRef');
  applyOptionalInteger(env, overrides, 'GITHUB_API_TIMEOUT_MS', 'api.timeoutMs');
  applyOptionalBoolean(
    env,
    overrides,
    'GITHUB_API_RETRIES_ENABLED',
    'api.retriesEnabled',
  );

  if (hasGithubActionsTokenSignal(env)) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'authMode', 'personal-access-token');

    if (getEnv(env, 'GITHUB_TOKEN_REF') === undefined) {
      setDeepValue(overrides, 'api.tokenRef', 'GITHUB_TOKEN');
    }
  }
}

function applyDerivedGithubOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const appUrl =
    getEnv(env, 'APP_URL') ??
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL');

  if (
    appUrl !== undefined &&
    getEnv(env, 'GITHUB_REDIRECT_URI') === undefined &&
    hasGithubOAuthSignal(env)
  ) {
    setDeepValue(overrides, 'redirectUri', `${appUrl}/api/auth/callback/github`);
    setDeepValue(
      overrides,
      'oauth.redirectUri',
      `${appUrl}/api/auth/callback/github`,
    );
  }

  const clientId =
    getEnv(env, 'GITHUB_CLIENT_ID') ?? getEnv(env, 'GITHUB_APP_CLIENT_ID');

  if (clientId !== undefined) {
    setDeepValue(overrides, 'clientId', clientId);
  }

  const repositoryFullName =
    getEnv(env, 'GITHUB_REPOSITORY') ??
    getEnv(env, 'GITHUB_REPOSITORY_FULL_NAME');

  if (repositoryFullName !== undefined) {
    const [owner, name] = repositoryFullName.split('/');

    if (owner !== undefined && owner.length > 0) {
      setDeepValue(overrides, 'repository.owner', owner);
    }

    if (name !== undefined && name.length > 0) {
      setDeepValue(overrides, 'repository.name', name);
    }

    setDeepValue(overrides, 'repository.fullName', repositoryFullName);

    if (getEnv(env, 'GITHUB_REPO_URL') === undefined) {
      const url = `https://github.com/${repositoryFullName}`;

      setDeepValue(overrides, 'repoUrl', url);
      setDeepValue(overrides, 'repository.url', url);
    }
  }

  if (
    getEnv(env, 'GITHUB_ENABLED') === undefined &&
    (hasGithubOAuthSignal(env) ||
      hasGithubAppSignal(env) ||
      hasGithubActionsTokenSignal(env))
  ) {
    setDeepValue(overrides, 'enabled', true);
  }
}

function applyGithubPermissionOverride(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  permissionName: string,
): void {
  const envKey = `GITHUB_PERMISSION_${permissionName.toUpperCase()}`;
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(overrides, `app.permissions.${permissionName}`, value);
  }
}

function hasGithubOAuthSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'GITHUB_CLIENT_ID') ||
      getEnv(env, 'GITHUB_CLIENT_SECRET_REF') ||
      getEnv(env, 'GITHUB_CLIENT_SECRET') ||
      getEnv(env, 'GITHUB_REDIRECT_URI') ||
      getEnv(env, 'GITHUB_OAUTH_SCOPES'),
  );
}

function hasGithubAppSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'GITHUB_APP_ID') ||
      getEnv(env, 'GITHUB_APP_CLIENT_ID') ||
      getEnv(env, 'GITHUB_APP_CLIENT_SECRET_REF') ||
      getEnv(env, 'GITHUB_APP_INSTALLATION_ID') ||
      getEnv(env, 'GITHUB_APP_PRIVATE_KEY_REF') ||
      getEnv(env, 'GITHUB_APP_WEBHOOK_SECRET_REF'),
  );
}

function hasGithubActionsTokenSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'GITHUB_TOKEN') ||
      getEnv(env, 'GITHUB_TOKEN_REF') ||
      getEnv(env, 'GH_TOKEN') ||
      getEnv(env, 'GITHUB_ACTIONS'),
  );
}

function applyOptionalString(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalBoolean(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvBoolean(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalInteger(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvInteger(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalList(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvList(env, envKey);

  if (value.length > 0) {
    setDeepValue(target, path, value);
  }
}
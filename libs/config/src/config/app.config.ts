import type { AppConfig } from '../types/app';

import {
  defaultAppConfig,
  defaultCloudflareAppConfig,
  defaultLocalAppConfig,
} from '../defaults/app.defaults';
import { appSchema } from '../schema/app.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  isCloudflareEnv,
  resolveAppEnvironment,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

import { createAuthConfig } from './auth.config';
import { createCloudflareConfig } from './cloudflare.config';
import { createDatabaseConfig } from './database.config';
import { createDiscordConfig } from './discord.config';
import { createGithubConfig } from './github.config';
import { createGrafanaCloudConfig } from './grafana-cloud.config';
import { createRedisConfig } from './redis.config';
import { createRoutesConfig } from './routes.config';
import { createSecurityConfig } from './security.config';
import { createServicesConfig } from './services.config';
import { createStorageConfig } from './storage.config';
import { createTelemetryConfig } from './telemetry.config';

export type AppConfigProfile = 'default' | 'local' | 'cloudflare' | 'auto';

export type ResolvedAppConfigProfile = Exclude<AppConfigProfile, 'auto'>;

export type AppConfigOptions = {
  name?: string;
  profile?: AppConfigProfile;
  defaults?: AppConfig;
};

export function createAppConfig(
  env: EnvRecord = {},
  options: AppConfigOptions = {},
): AppConfig {
  const configName = options.name ?? 'app config';
  const profile = resolveAppConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveAppConfigDefaults(profile);

  const overrides = buildAppConfigOverrides(env, profile);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(appSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data as AppConfig;
}

export function buildAppConfigOverrides(
  env: EnvRecord,
  profile: ResolvedAppConfigProfile = resolveAppConfigProfile(env),
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootAppOverrides(env, overrides, profile);
  applyPublicRuntimeOverrides(env, overrides);
  applyModuleOverrides(env, overrides, profile);
  applyDerivedAppOverrides(env, overrides, profile);

  return overrides;
}

export function resolveAppConfigProfile(
  env: EnvRecord,
  profile: AppConfigProfile = 'auto',
): ResolvedAppConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const runtime = getEnv(env, 'APP_RUNTIME') ?? getEnv(env, 'HELIX_RUNTIME');

  if (runtime === 'cloudflare-worker') {
    return 'cloudflare';
  }

  if (isCloudflareEnv(env)) {
    return 'cloudflare';
  }

  const environment = resolveAppEnvironment(env);

  if (environment === 'production' || environment === 'preview') {
    return 'cloudflare';
  }

  if (environment === 'development' || environment === 'test') {
    return 'local';
  }

  return 'default';
}

export function resolveAppConfigDefaults(
  profile: ResolvedAppConfigProfile,
): AppConfig {
  if (profile === 'cloudflare') {
    return deepClone(defaultCloudflareAppConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalAppConfig);
  }

  return deepClone(defaultAppConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createAppConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const appConfig = createAppConfig();

export default appConfig;

function applyRootAppOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  profile: ResolvedAppConfigProfile,
): void {
  const environment = resolveAppEnvironment(env);

  setDeepValue(overrides, 'environment', environment);

  const runtime =
    getEnv(env, 'APP_RUNTIME') ??
    getEnv(env, 'HELIX_RUNTIME') ??
    (profile === 'cloudflare' ? 'cloudflare-worker' : undefined);

  if (runtime !== undefined) {
    setDeepValue(overrides, 'runtime', runtime);
  }

  applyOptionalString(env, overrides, 'APP_ID', 'app.name');
  applyOptionalString(env, overrides, 'HELIX_APP_ID', 'app.name');

  const displayName =
    getEnv(env, 'APP_NAME') ??
    getEnv(env, 'NEXT_PUBLIC_APP_NAME') ??
    getEnv(env, 'PUBLIC_APP_NAME');

  if (displayName !== undefined) {
    setDeepValue(overrides, 'app.displayName', displayName);
  }

  applyOptionalString(env, overrides, 'APP_VERSION', 'app.version');
  applyOptionalString(env, overrides, 'NEXT_PUBLIC_APP_VERSION', 'app.version');

  const release =
    getEnv(env, 'APP_RELEASE') ??
    getEnv(env, 'NEXT_PUBLIC_APP_RELEASE') ??
    getEnv(env, 'CF_PAGES_COMMIT_SHA');

  if (release !== undefined) {
    setDeepValue(overrides, 'app.release', release);
  }

  applyOptionalString(env, overrides, 'APP_OWNER', 'app.owner');

  const appUrl =
    getEnv(env, 'APP_URL') ??
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL');

  if (appUrl !== undefined) {
    setDeepValue(overrides, 'app.url', appUrl);
  }

  const domain =
    getEnv(env, 'APP_DOMAIN') ??
    getEnv(env, 'PRIMARY_DOMAIN') ??
    getEnv(env, 'CLOUDFLARE_ZONE_NAME');

  if (domain !== undefined) {
    setDeepValue(overrides, 'app.domain', domain);
  }
}

function applyPublicRuntimeOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const environment = resolveAppEnvironment(env);

  setDeepValue(overrides, 'publicRuntime.environment', environment);

  const appName =
    getEnv(env, 'NEXT_PUBLIC_APP_NAME') ??
    getEnv(env, 'PUBLIC_APP_NAME') ??
    getEnv(env, 'APP_NAME');

  if (appName !== undefined) {
    setDeepValue(overrides, 'publicRuntime.appName', appName);
  }

  const appUrl =
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL') ??
    getEnv(env, 'APP_URL');

  if (appUrl !== undefined) {
    setDeepValue(overrides, 'publicRuntime.appUrl', appUrl);
  }

  const release =
    getEnv(env, 'NEXT_PUBLIC_APP_RELEASE') ??
    getEnv(env, 'PUBLIC_RELEASE') ??
    getEnv(env, 'APP_RELEASE') ??
    getEnv(env, 'CF_PAGES_COMMIT_SHA');

  if (release !== undefined) {
    setDeepValue(overrides, 'publicRuntime.release', release);
  }

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_FARO_URL',
    'publicRuntime.faroUrl',
  );
  applyOptionalString(
    env,
    overrides,
    'PUBLIC_FARO_URL',
    'publicRuntime.faroUrl',
  );

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_DISCORD_APPLICATION_ID',
    'publicRuntime.discordApplicationId',
  );

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_GITHUB_CLIENT_ID',
    'publicRuntime.githubClientId',
  );

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    'publicRuntime.googleClientId',
  );

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'publicRuntime.turnstileSiteKey',
  );

  /**
   * Intentionally do not map encryption keys into publicRuntime.
   *
   * NEXT_PUBLIC_* values are browser-visible in Next.js builds.
   */
}

function applyModuleOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  profile: ResolvedAppConfigProfile,
): void {
  const isCloudflareProfile = profile === 'cloudflare';
  const isLocalProfile = profile === 'local';

  setDeepValue(
    overrides,
    'cloudflare',
    createCloudflareConfig(env, {
      profile: isCloudflareProfile
        ? 'production'
        : isLocalProfile
          ? 'local'
          : 'default',
    }),
  );

  setDeepValue(
    overrides,
    'database',
    createDatabaseConfig(env, {
      profile: isCloudflareProfile
        ? 'cloudflare-hyperdrive'
        : isLocalProfile
          ? 'local-postgres'
          : 'default',
    }),
  );

  setDeepValue(
    overrides,
    'storage',
    createStorageConfig(env, {
      profile: isCloudflareProfile
        ? 'cloudflare-r2'
        : isLocalProfile
          ? 'local'
          : 'default',
    }),
  );

  setDeepValue(
    overrides,
    'github',
    createGithubConfig(env, {
      profile: 'auto',
    }),
  );

  setDeepValue(
    overrides,
    'discord',
    createDiscordConfig(env, {
      profile: isCloudflareProfile
        ? 'production'
        : isLocalProfile
          ? 'local'
          : 'default',
    }),
  );

  setDeepValue(
    overrides,
    'grafanaCloud',
    createGrafanaCloudConfig(env, {
      profile: isCloudflareProfile
        ? 'production'
        : isLocalProfile
          ? 'local'
          : 'default',
    }),
  );

  setDeepValue(
    overrides,
    'security',
    createSecurityConfig(env, {
      profile: isCloudflareProfile
        ? 'production'
        : isLocalProfile
          ? 'local'
          : 'default',
    }),
  );

  setDeepValue(
    overrides,
    'auth',
    createAuthConfig(env, {
      profile: isCloudflareProfile
        ? 'cloudflare'
        : isLocalProfile
          ? 'local'
          : 'default',
    }),
  );

  setDeepValue(
    overrides,
    'routes',
    createRoutesConfig(env, {
      profile: isCloudflareProfile
        ? 'cloudflare'
        : isLocalProfile
          ? 'local'
          : 'default',
    }),
  );

  setDeepValue(overrides, 'telemetry', createTelemetryConfig(env));

  setDeepValue(
    overrides,
    'services',
    createServicesConfig(env, {
      profile: isCloudflareProfile
        ? 'cloudflare'
        : isLocalProfile
          ? 'local'
          : 'default',
    }),
  );

  setDeepValue(
    overrides,
    'redis',
    createRedisConfig(env, {
      profile: isCloudflareProfile
        ? 'upstash'
        : isLocalProfile
          ? 'local'
          : 'auto',
    }),
  );
}

function applyDerivedAppOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  profile: ResolvedAppConfigProfile,
): void {
  const environment = resolveAppEnvironment(env);

  const domain =
    getEnv(env, 'APP_DOMAIN') ??
    getEnv(env, 'PRIMARY_DOMAIN') ??
    getEnv(env, 'CLOUDFLARE_ZONE_NAME') ??
    (profile === 'cloudflare' ? 'helixaibot.com' : undefined);

  const appUrl =
    getEnv(env, 'APP_URL') ??
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL') ??
    (profile === 'cloudflare' && domain !== undefined
      ? `https://${domain}`
      : undefined) ??
    (profile === 'local' ? 'http://localhost:3000' : undefined);

  if (domain !== undefined) {
    setDeepValue(overrides, 'app.domain', domain);
  }

  if (appUrl !== undefined) {
    setDeepValue(overrides, 'app.url', appUrl);
    setDeepValue(overrides, 'publicRuntime.appUrl', appUrl);
  }

  if (profile === 'cloudflare') {
    setDeepValue(overrides, 'runtime', 'cloudflare-worker');
    setDeepValue(overrides, 'cloudflare.enabled', true);
    setDeepValue(overrides, 'cloudflare.defaultEnvironment', environment);
    setDeepValue(overrides, 'cloudflare.worker.runtime', 'cloudflare-worker');
  }

  if (environment === 'production') {
    setDeepValue(overrides, 'auth.enabled', true);
    setDeepValue(overrides, 'security.environment', 'production');
    setDeepValue(overrides, 'security.cookies.secure', true);

    if (domain !== undefined) {
      setDeepValue(overrides, 'auth.cookies.domain', domain);
      setDeepValue(overrides, 'security.cookies.domain', domain);
    }
  }

  const appName =
    getEnv(env, 'APP_NAME') ??
    getEnv(env, 'NEXT_PUBLIC_APP_NAME') ??
    'Helix AI';

  setDeepValue(overrides, 'publicRuntime.appName', appName);

  const release =
    getEnv(env, 'APP_RELEASE') ??
    getEnv(env, 'NEXT_PUBLIC_APP_RELEASE') ??
    getEnv(env, 'CF_PAGES_COMMIT_SHA');

  if (release !== undefined) {
    setDeepValue(overrides, 'publicRuntime.release', release);
  }

  if (getEnvBoolean(env, 'FARO_ENABLED') === true) {
    setDeepValue(overrides, 'telemetry.faro.enabled', true);
    setDeepValue(overrides, 'grafanaCloud.addons.faro.enabled', true);
  }

  /**
   * Backward-compatible bridge only.
   *
   * Do not expose profileEncryptionKey through publicRuntime/publicTokens.
   */
  const profileEncryptionKey = getEnv(env, 'PROFILE_ENCRYPTION_KEY');

  if (profileEncryptionKey !== undefined) {
    setDeepValue(
      overrides,
      'telemetry.profileEncryptionKey',
      profileEncryptionKey,
    );
  }
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
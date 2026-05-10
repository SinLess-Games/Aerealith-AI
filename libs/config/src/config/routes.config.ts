import type { RoutesConfig } from '../types/routes';

import {
  defaultCloudflareRoutesConfig,
  defaultLocalRoutesConfig,
  defaultRoutesConfig,
} from '../defaults/routes.defaults';
import { routesSchema } from '../schema/routes.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  isCloudflareEnv,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type RoutesConfigProfile = 'default' | 'local' | 'cloudflare' | 'auto';

export type ResolvedRoutesConfigProfile = Exclude<
  RoutesConfigProfile,
  'auto'
>;

export type RoutesConfigOptions = {
  name?: string;
  profile?: RoutesConfigProfile;
  defaults?: RoutesConfig;
};

type KnownRouteGroupConfig = {
  key: string;
  envPrefix: string;
  serviceEnvPrefix?: string;
};

const knownRouteGroups = [
  {
    key: 'auth',
    envPrefix: 'AUTH_ROUTES',
    serviceEnvPrefix: 'AUTH_SERVICE',
  },
  {
    key: 'users',
    envPrefix: 'USER_ROUTES',
    serviceEnvPrefix: 'USER_SERVICE',
  },
  {
    key: 'waitlist',
    envPrefix: 'WAITLIST_ROUTES',
  },
] satisfies readonly KnownRouteGroupConfig[];

export function createRoutesConfig(
  env: EnvRecord = {},
  options: RoutesConfigOptions = {},
): RoutesConfig {
  const configName = options.name ?? 'routes config';
  const profile = resolveRoutesConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveRoutesConfigDefaults(profile);
  const overrides = buildRoutesConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(routesSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data as RoutesConfig;
}

export function buildRoutesConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootRouteOverrides(env, overrides);
  applyKnownRouteGroupOverrides(env, overrides);
  applyRoutesEnabledDerivedOverrides(env, overrides);

  return overrides;
}

export function resolveRoutesConfigProfile(
  env: EnvRecord,
  profile: RoutesConfigProfile = 'auto',
): ResolvedRoutesConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const explicitRuntime =
    getEnv(env, 'APP_RUNTIME') ?? getEnv(env, 'HELIX_RUNTIME');

  if (explicitRuntime === 'cloudflare-worker') {
    return 'cloudflare';
  }

  if (isCloudflareEnv(env)) {
    return 'cloudflare';
  }

  const appEnv = getEnv(env, 'APP_ENV') ?? getEnv(env, 'NODE_ENV');

  if (appEnv === 'development' || appEnv === 'test') {
    return 'local';
  }

  return 'default';
}

export function resolveRoutesConfigDefaults(
  profile: ResolvedRoutesConfigProfile,
): RoutesConfig {
  if (profile === 'cloudflare') {
    return deepClone(defaultCloudflareRoutesConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalRoutesConfig);
  }

  return deepClone(defaultRoutesConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createRoutesConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const routesConfig = createRoutesConfig();

export default routesConfig;

function applyRootRouteOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'ROUTES_ENABLED', 'enabled');

  const apiVersion = getEnv(env, 'ROUTES_API_VERSION') ?? getEnv(env, 'API_VERSION');
  const apiBasePath =
    getEnv(env, 'ROUTES_API_BASE_PATH') ?? getEnv(env, 'API_ROOT_BASE_PATH');
  const healthPath =
    getEnv(env, 'ROUTES_HEALTH_PATH') ?? getEnv(env, 'API_HEALTH_PATH');

  if (apiVersion !== undefined) {
    setDeepValue(overrides, 'apiVersion', normalizeApiVersion(apiVersion));
  }

  if (apiBasePath !== undefined) {
    setDeepValue(overrides, 'apiBasePath', normalizeApiPath(apiBasePath));
  }

  if (healthPath !== undefined) {
    setDeepValue(overrides, 'healthPath', normalizeApiPath(healthPath));
  }
}

function applyKnownRouteGroupOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  for (const routeGroup of knownRouteGroups) {
    applySingleRouteGroupOverrides(env, overrides, routeGroup);
  }
}

function applySingleRouteGroupOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  routeGroup: KnownRouteGroupConfig,
): void {
  const basePath = `registry.${routeGroup.key}`;
  const prefix = routeGroup.envPrefix;
  const servicePrefix = routeGroup.serviceEnvPrefix;

  const enabled = getEnvBoolean(env, `${prefix}_ENABLED`);
  const basePathValue =
    getEnv(env, `${prefix}_BASE_PATH`) ??
    (servicePrefix ? getEnv(env, `${servicePrefix}_BASE_PATH`) : undefined);
  const healthPathValue =
    getEnv(env, `${prefix}_HEALTH_PATH`) ??
    (servicePrefix ? getEnv(env, `${servicePrefix}_HEALTH_PATH`) : undefined);

  if (enabled !== undefined) {
    setDeepValue(overrides, `${basePath}.enabled`, enabled);
  }

  if (basePathValue !== undefined) {
    const normalizedBasePath = normalizeApiPath(basePathValue);

    setDeepValue(overrides, `${basePath}.basePath`, normalizedBasePath);
    setDeepValue(overrides, `${basePath}.name`, routeGroup.key);

    applyRouteFullPathOverrides(
      overrides,
      routeGroup.key,
      normalizedBasePath,
    );
  }

  if (healthPathValue !== undefined) {
    setDeepValue(
      overrides,
      `${basePath}.healthPath`,
      normalizeApiPath(healthPathValue),
    );
  }

  if (hasRouteGroupSignal(env, routeGroup)) {
    setDeepValue(overrides, `${basePath}.name`, routeGroup.key);
  }
}

function applyRouteFullPathOverrides(
  overrides: Record<string, unknown>,
  routeGroupKey: string,
  basePath: `/api/${string}`,
): void {
  const routesBasePath = `registry.${routeGroupKey}.routes`;

  if (routeGroupKey === 'auth') {
    setDeepValue(overrides, `${routesBasePath}.health.fullPath`, `${basePath}/health`);
    setDeepValue(overrides, `${routesBasePath}.register.fullPath`, `${basePath}/register`);
    setDeepValue(overrides, `${routesBasePath}.login.fullPath`, `${basePath}/login`);
    setDeepValue(overrides, `${routesBasePath}.logout.fullPath`, `${basePath}/logout`);
    setDeepValue(overrides, `${routesBasePath}.session.fullPath`, `${basePath}/session`);
    setDeepValue(overrides, `${routesBasePath}.refresh.fullPath`, `${basePath}/refresh`);
    setDeepValue(
      overrides,
      `${routesBasePath}.verifyEmail.fullPath`,
      `${basePath}/verify-email`,
    );

    return;
  }

  if (routeGroupKey === 'users') {
    setDeepValue(overrides, `${routesBasePath}.health.fullPath`, `${basePath}/health`);
    setDeepValue(overrides, `${routesBasePath}.list.fullPath`, basePath);
    setDeepValue(overrides, `${routesBasePath}.create.fullPath`, basePath);
    setDeepValue(
      overrides,
      `${routesBasePath}.getByUsername.fullPath`,
      `${basePath}/:username`,
    );
    setDeepValue(
      overrides,
      `${routesBasePath}.updateByUsername.fullPath`,
      `${basePath}/:username`,
    );
    setDeepValue(
      overrides,
      `${routesBasePath}.deleteByUsername.fullPath`,
      `${basePath}/:username`,
    );
    setDeepValue(
      overrides,
      `${routesBasePath}.profile.fullPath`,
      `${basePath}/:username/profile`,
    );
    setDeepValue(
      overrides,
      `${routesBasePath}.settings.fullPath`,
      `${basePath}/:username/settings`,
    );

    return;
  }

  if (routeGroupKey === 'waitlist') {
    setDeepValue(overrides, `${routesBasePath}.health.fullPath`, `${basePath}/health`);
    setDeepValue(overrides, `${routesBasePath}.create.fullPath`, basePath);
    setDeepValue(overrides, `${routesBasePath}.list.fullPath`, basePath);
    setDeepValue(
      overrides,
      `${routesBasePath}.deleteByEmail.fullPath`,
      `${basePath}/:email`,
    );
  }
}

function applyRoutesEnabledDerivedOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (getEnvBoolean(env, 'ROUTES_ENABLED') !== undefined) {
    return;
  }

  if (
    isCloudflareEnv(env) ||
    getEnv(env, 'API_VERSION') !== undefined ||
    getEnv(env, 'API_BASE_PATH') !== undefined ||
    getEnv(env, 'ROUTES_API_BASE_PATH') !== undefined ||
    knownRouteGroups.some((routeGroup) => hasRouteGroupSignal(env, routeGroup))
  ) {
    setDeepValue(overrides, 'enabled', true);
  }
}

function hasRouteGroupSignal(
  env: EnvRecord,
  routeGroup: KnownRouteGroupConfig,
): boolean {
  const prefix = routeGroup.envPrefix;
  const servicePrefix = routeGroup.serviceEnvPrefix;

  return Boolean(
    getEnv(env, `${prefix}_ENABLED`) ||
      getEnv(env, `${prefix}_BASE_PATH`) ||
      getEnv(env, `${prefix}_HEALTH_PATH`) ||
      (servicePrefix && getEnv(env, `${servicePrefix}_BASE_PATH`)) ||
      (servicePrefix && getEnv(env, `${servicePrefix}_HEALTH_PATH`)),
  );
}

function normalizeApiVersion(version: string): string {
  const normalized = version.trim();

  if (/^v\d+$/i.test(normalized)) {
    return `V${normalized.slice(1)}`;
  }

  return normalized;
}

function normalizeApiPath(path: string): `/api/${string}` {
  const normalized = path.trim();

  if (normalized.startsWith('/api/')) {
    return normalized as `/api/${string}`;
  }

  if (normalized.startsWith('api/')) {
    return `/${normalized}` as `/api/${string}`;
  }

  throw new Error(`API path must start with "/api/". Received "${path}".`);
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
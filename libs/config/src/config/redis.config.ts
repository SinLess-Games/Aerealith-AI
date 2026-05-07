import type { RedisConfig } from '../types/redis';

import {
  defaultLocalRedisConfig,
  defaultRedisConfig,
  defaultTcpRedisConfig,
  defaultUpstashRedisConfig,
} from '../defaults/redis.defaults';
import { redisSchema } from '../schema/redis.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  isCloudflareEnv,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type RedisConfigProfile =
  | 'default'
  | 'local'
  | 'tcp'
  | 'upstash'
  | 'auto';

export type ResolvedRedisConfigProfile = Exclude<RedisConfigProfile, 'auto'>;

export type RedisConfigOptions = {
  name?: string;
  profile?: RedisConfigProfile;
  defaults?: RedisConfig;
};

export function createRedisConfig(
  env: EnvRecord = {},
  options: RedisConfigOptions = {},
): RedisConfig {
  const configName = options.name ?? 'redis config';
  const profile = resolveRedisConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveRedisConfigDefaults(profile);
  const overrides = buildRedisConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(redisSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function buildRedisConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootRedisOverrides(env, overrides);
  applyFlatBackCompatOverrides(env, overrides);
  applyCacheInstanceOverrides(env, overrides);
  applySessionInstanceOverrides(env, overrides);
  applyRateLimitInstanceOverrides(env, overrides);
  applyFeatureFlagsInstanceOverrides(env, overrides);
  applyUpstashDerivedOverrides(env, overrides);
  applyTcpDerivedOverrides(env, overrides);
  applyRedisEnabledDerivedOverrides(env, overrides);

  return overrides;
}

export function resolveRedisConfigProfile(
  env: EnvRecord,
  profile: RedisConfigProfile = 'auto',
): ResolvedRedisConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const explicitProvider = getEnv(env, 'REDIS_PROVIDER');

  if (explicitProvider === 'upstash') {
    return 'upstash';
  }

  if (explicitProvider === 'redis') {
    return 'tcp';
  }

  if (explicitProvider === 'memory') {
    return 'local';
  }

  if (hasUpstashSignal(env) || isCloudflareEnv(env)) {
    return 'upstash';
  }

  if (hasTcpRedisSignal(env)) {
    return 'tcp';
  }

  const appEnv = getEnv(env, 'APP_ENV') ?? getEnv(env, 'NODE_ENV');

  if (appEnv === 'development' || appEnv === 'test') {
    return 'local';
  }

  return 'default';
}

export function resolveRedisConfigDefaults(
  profile: ResolvedRedisConfigProfile,
): RedisConfig {
  if (profile === 'upstash') {
    return deepClone(defaultUpstashRedisConfig);
  }

  if (profile === 'tcp') {
    return deepClone(defaultTcpRedisConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalRedisConfig);
  }

  return deepClone(defaultRedisConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createRedisConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const redisConfig = createRedisConfig();

export default redisConfig;

function applyRootRedisOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'REDIS_ENABLED', 'enabled');
  applyOptionalString(env, overrides, 'REDIS_DEFAULT_INSTANCE', 'defaultInstance');
}

function applyFlatBackCompatOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalString(env, overrides, 'REDIS_URL', 'url');
  applyOptionalString(env, overrides, 'REDIS_HOST', 'host');
  applyOptionalString(env, overrides, 'REDIS_USERNAME', 'username');
  applyOptionalString(env, overrides, 'REDIS_PASSWORD', 'password');
  applyOptionalInteger(env, overrides, 'REDIS_PORT', 'port');
  applyOptionalString(env, overrides, 'REDIS_CACHE_PREFIX', 'cachePrefix');
  applyOptionalInteger(
    env,
    overrides,
    'REDIS_CACHE_EXPIRATION_MS',
    'cacheExpirationMs',
  );
}

function applyCacheInstanceOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyRedisInstanceOverrides(env, overrides, {
    instance: 'cache',
    envPrefix: 'REDIS_CACHE',
    defaultRole: 'cache',
    defaultPrefix: 'helix:cache:',
    defaultTtlSeconds: 15 * 60,
  });
}

function applySessionInstanceOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyRedisInstanceOverrides(env, overrides, {
    instance: 'session',
    envPrefix: 'REDIS_SESSION',
    defaultRole: 'session',
    defaultPrefix: 'helix:session:',
    defaultTtlSeconds: 30 * 24 * 60 * 60,
  });
}

function applyRateLimitInstanceOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyRedisInstanceOverrides(env, overrides, {
    instance: 'rateLimit',
    envPrefix: 'REDIS_RATE_LIMIT',
    defaultRole: 'rate-limit',
    defaultPrefix: 'helix:rate-limit:',
    defaultTtlSeconds: 60,
  });
}

function applyFeatureFlagsInstanceOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyRedisInstanceOverrides(env, overrides, {
    instance: 'featureFlags',
    envPrefix: 'REDIS_FEATURE_FLAGS',
    defaultRole: 'feature-flags',
    defaultPrefix: 'helix:flags:',
    defaultTtlSeconds: 5 * 60,
  });
}

function applyRedisInstanceOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  options: {
    instance: string;
    envPrefix: string;
    defaultRole: string;
    defaultPrefix: string;
    defaultTtlSeconds: number;
  },
): void {
  const basePath = `instances.${options.instance}`;

  const enabled = getEnvBoolean(env, `${options.envPrefix}_ENABLED`);
  const provider = getEnv(env, `${options.envPrefix}_PROVIDER`);
  const role = getEnv(env, `${options.envPrefix}_ROLE`);
  const namespace = getEnv(env, `${options.envPrefix}_NAMESPACE`);

  const url = getEnv(env, `${options.envPrefix}_URL`);
  const urlRef = getEnv(env, `${options.envPrefix}_URL_REF`);

  const host = getEnv(env, `${options.envPrefix}_HOST`);
  const port = getEnvInteger(env, `${options.envPrefix}_PORT`);

  const username = getEnv(env, `${options.envPrefix}_USERNAME`);
  const usernameRef = getEnv(env, `${options.envPrefix}_USERNAME_REF`);

  const password = getEnv(env, `${options.envPrefix}_PASSWORD`);
  const passwordRef = getEnv(env, `${options.envPrefix}_PASSWORD_REF`);

  const database = getEnvInteger(env, `${options.envPrefix}_DATABASE`);
  const transport = getEnv(env, `${options.envPrefix}_TRANSPORT`);
  const binding = getEnv(env, `${options.envPrefix}_BINDING`);

  const restUrl = getEnv(env, `${options.envPrefix}_REST_URL`);
  const restTokenRef = getEnv(env, `${options.envPrefix}_REST_TOKEN_REF`);
  const restTokenHeader = getEnv(env, `${options.envPrefix}_REST_TOKEN_HEADER`);

  const tlsEnabled = getEnvBoolean(env, `${options.envPrefix}_TLS_ENABLED`);
  const tlsRejectUnauthorized = getEnvBoolean(
    env,
    `${options.envPrefix}_TLS_REJECT_UNAUTHORIZED`,
  );

  const connectTimeoutMs = getEnvInteger(
    env,
    `${options.envPrefix}_CONNECT_TIMEOUT_MS`,
  );
  const commandTimeoutMs = getEnvInteger(
    env,
    `${options.envPrefix}_COMMAND_TIMEOUT_MS`,
  );
  const lazyConnect = getEnvBoolean(env, `${options.envPrefix}_LAZY_CONNECT`);
  const maxRetries = getEnvInteger(env, `${options.envPrefix}_MAX_RETRIES`);

  const prefix = getEnv(env, `${options.envPrefix}_PREFIX`);
  const cachePrefix = getEnv(env, `${options.envPrefix}_CACHE_PREFIX`);
  const expirationMs = getEnvInteger(env, `${options.envPrefix}_EXPIRATION_MS`);
  const cacheExpirationMs = getEnvInteger(
    env,
    `${options.envPrefix}_CACHE_EXPIRATION_MS`,
  );
  const ttlSeconds = getEnvInteger(env, `${options.envPrefix}_TTL_SECONDS`);
  const staleReadsEnabled = getEnvBoolean(
    env,
    `${options.envPrefix}_STALE_READS_ENABLED`,
  );

  if (
    enabled === undefined &&
    provider === undefined &&
    role === undefined &&
    namespace === undefined &&
    url === undefined &&
    urlRef === undefined &&
    host === undefined &&
    port === undefined &&
    username === undefined &&
    usernameRef === undefined &&
    password === undefined &&
    passwordRef === undefined &&
    database === undefined &&
    transport === undefined &&
    binding === undefined &&
    restUrl === undefined &&
    restTokenRef === undefined &&
    restTokenHeader === undefined &&
    tlsEnabled === undefined &&
    tlsRejectUnauthorized === undefined &&
    connectTimeoutMs === undefined &&
    commandTimeoutMs === undefined &&
    lazyConnect === undefined &&
    maxRetries === undefined &&
    prefix === undefined &&
    cachePrefix === undefined &&
    expirationMs === undefined &&
    cacheExpirationMs === undefined &&
    ttlSeconds === undefined &&
    staleReadsEnabled === undefined
  ) {
    return;
  }

  setDeepValue(overrides, `${basePath}.name`, options.instance);
  setDeepValue(overrides, `${basePath}.enabled`, enabled ?? true);
  setDeepValue(overrides, `${basePath}.role`, role ?? options.defaultRole);

  if (provider !== undefined) {
    setDeepValue(overrides, `${basePath}.provider`, provider);
  }

  if (namespace !== undefined) {
    setDeepValue(overrides, `${basePath}.namespace`, namespace);
  }

  if (url !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.url`, url);
  }

  if (urlRef !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.urlRef`, urlRef);
  }

  if (host !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.host`, host);
  }

  if (port !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.port`, port);
  }

  if (username !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.username`, username);
  }

  if (usernameRef !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.usernameRef`, usernameRef);
  }

  if (password !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.password`, password);
  }

  if (passwordRef !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.passwordRef`, passwordRef);
  }

  if (database !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.database`, database);
  }

  if (transport !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.transport`, transport);
  }

  if (binding !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.binding`, binding);
  }

  if (
    restUrl !== undefined ||
    restTokenRef !== undefined ||
    restTokenHeader !== undefined
  ) {
    if (restUrl !== undefined) {
      setDeepValue(overrides, `${basePath}.connection.rest.url`, restUrl);
    }

    if (restTokenRef !== undefined) {
      setDeepValue(overrides, `${basePath}.connection.rest.tokenRef`, restTokenRef);
    }

    if (restTokenHeader !== undefined) {
      setDeepValue(
        overrides,
        `${basePath}.connection.rest.tokenHeader`,
        restTokenHeader,
      );
    }
  }

  if (tlsEnabled !== undefined || tlsRejectUnauthorized !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.tls.enabled`, tlsEnabled ?? true);

    if (tlsRejectUnauthorized !== undefined) {
      setDeepValue(
        overrides,
        `${basePath}.connection.tls.rejectUnauthorized`,
        tlsRejectUnauthorized,
      );
    }
  }

  if (connectTimeoutMs !== undefined) {
    setDeepValue(
      overrides,
      `${basePath}.connection.connectTimeoutMs`,
      connectTimeoutMs,
    );
  }

  if (commandTimeoutMs !== undefined) {
    setDeepValue(
      overrides,
      `${basePath}.connection.commandTimeoutMs`,
      commandTimeoutMs,
    );
  }

  if (lazyConnect !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.lazyConnect`, lazyConnect);
  }

  if (maxRetries !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.maxRetries`, maxRetries);
  }

  setDeepValue(
    overrides,
    `${basePath}.cache.prefix`,
    prefix ?? cachePrefix ?? options.defaultPrefix,
  );
  setDeepValue(
    overrides,
    `${basePath}.cache.cachePrefix`,
    cachePrefix ?? prefix ?? options.defaultPrefix,
  );
  setDeepValue(
    overrides,
    `${basePath}.cache.ttlSeconds`,
    ttlSeconds ?? options.defaultTtlSeconds,
  );
  setDeepValue(
    overrides,
    `${basePath}.cache.expirationMs`,
    expirationMs ?? (ttlSeconds ?? options.defaultTtlSeconds) * 1000,
  );
  setDeepValue(
    overrides,
    `${basePath}.cache.cacheExpirationMs`,
    cacheExpirationMs ?? expirationMs ?? (ttlSeconds ?? options.defaultTtlSeconds) * 1000,
  );

  if (staleReadsEnabled !== undefined) {
    setDeepValue(
      overrides,
      `${basePath}.cache.staleReadsEnabled`,
      staleReadsEnabled,
    );
  }
}

function applyUpstashDerivedOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (!hasUpstashSignal(env)) {
    return;
  }

  const urlRef =
    getEnv(env, 'UPSTASH_REDIS_REST_URL_REF') ?? 'UPSTASH_REDIS_REST_URL';
  const tokenRef =
    getEnv(env, 'UPSTASH_REDIS_REST_TOKEN_REF') ?? 'UPSTASH_REDIS_REST_TOKEN';

  setDeepValue(overrides, 'enabled', true);
  setDeepValue(overrides, 'defaultInstance', 'cache');

  for (const instance of ['cache', 'session', 'rateLimit', 'featureFlags']) {
    const basePath = `instances.${instance}`;

    setDeepValue(overrides, `${basePath}.enabled`, true);
    setDeepValue(overrides, `${basePath}.provider`, 'upstash');
    setDeepValue(overrides, `${basePath}.connection.transport`, 'rest');
    setDeepValue(overrides, `${basePath}.connection.urlRef`, urlRef);
    setDeepValue(overrides, `${basePath}.connection.passwordRef`, tokenRef);
    setDeepValue(overrides, `${basePath}.connection.rest.tokenRef`, tokenRef);
    setDeepValue(overrides, `${basePath}.connection.rest.tokenHeader`, 'Authorization');
  }
}

function applyTcpDerivedOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (!hasTcpRedisSignal(env)) {
    return;
  }

  const urlRef = getEnv(env, 'REDIS_URL_REF') ?? 'REDIS_URL';
  const passwordRef = getEnv(env, 'REDIS_PASSWORD_REF') ?? 'REDIS_PASSWORD';

  setDeepValue(overrides, 'enabled', true);
  setDeepValue(overrides, 'defaultInstance', 'cache');
  setDeepValue(overrides, 'instances.cache.enabled', true);
  setDeepValue(overrides, 'instances.cache.provider', 'redis');
  setDeepValue(overrides, 'instances.cache.connection.transport', 'tcp');
  setDeepValue(overrides, 'instances.cache.connection.urlRef', urlRef);
  setDeepValue(overrides, 'instances.cache.connection.passwordRef', passwordRef);

  applyOptionalString(env, overrides, 'REDIS_URL', 'instances.cache.connection.url');
  applyOptionalString(env, overrides, 'REDIS_HOST', 'instances.cache.connection.host');
  applyOptionalString(
    env,
    overrides,
    'REDIS_USERNAME',
    'instances.cache.connection.username',
  );
  applyOptionalString(
    env,
    overrides,
    'REDIS_PASSWORD',
    'instances.cache.connection.password',
  );
  applyOptionalInteger(env, overrides, 'REDIS_PORT', 'instances.cache.connection.port');
  applyOptionalInteger(
    env,
    overrides,
    'REDIS_DATABASE',
    'instances.cache.connection.database',
  );
}

function applyRedisEnabledDerivedOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (getEnvBoolean(env, 'REDIS_ENABLED') !== undefined) {
    return;
  }

  if (
    hasUpstashSignal(env) ||
    hasTcpRedisSignal(env) ||
    getEnv(env, 'REDIS_PROVIDER') ||
    getEnv(env, 'REDIS_DEFAULT_INSTANCE')
  ) {
    setDeepValue(overrides, 'enabled', true);
  }
}

function hasUpstashSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'UPSTASH_REDIS_REST_URL') ||
      getEnv(env, 'UPSTASH_REDIS_REST_TOKEN') ||
      getEnv(env, 'UPSTASH_REDIS_REST_URL_REF') ||
      getEnv(env, 'UPSTASH_REDIS_REST_TOKEN_REF'),
  );
}

function hasTcpRedisSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'REDIS_URL') ||
      getEnv(env, 'REDIS_URL_REF') ||
      getEnv(env, 'REDIS_HOST') ||
      getEnv(env, 'REDIS_PORT') ||
      getEnv(env, 'REDIS_PASSWORD') ||
      getEnv(env, 'REDIS_PASSWORD_REF'),
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
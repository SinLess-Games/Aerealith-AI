import type { ServicesConfig } from '../types/services';

import {
  defaultCloudflareServicesConfig,
  defaultLocalServicesConfig,
  defaultServicesConfig,
} from '../defaults/services.defaults';
import { servicesSchema } from '../schema/services.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvList,
  isCloudflareEnv,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type ServicesConfigProfile = 'default' | 'local' | 'cloudflare' | 'auto';

export type ResolvedServicesConfigProfile = Exclude<
  ServicesConfigProfile,
  'auto'
>;

export type ServicesConfigOptions = {
  name?: string;
  profile?: ServicesConfigProfile;
  defaults?: ServicesConfig;
};

type KnownServiceConfig = {
  key: string;
  envPrefix: string;
};

const knownServices = [
  {
    key: 'frontend',
    envPrefix: 'FRONTEND',
  },
  {
    key: 'api-gateway',
    envPrefix: 'API_GATEWAY',
  },
  {
    key: 'auth',
    envPrefix: 'AUTH_SERVICE',
  },
  {
    key: 'users',
    envPrefix: 'USER_SERVICE',
  },
  {
    key: 'events',
    envPrefix: 'EVENTS_SERVICE',
  },
  {
    key: 'discord',
    envPrefix: 'DISCORD_SERVICE',
  },
] satisfies readonly KnownServiceConfig[];

export function createServicesConfig(
  env: EnvRecord = {},
  options: ServicesConfigOptions = {},
): ServicesConfig {
  const configName = options.name ?? 'services config';
  const profile = resolveServicesConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveServicesConfigDefaults(profile);
  const overrides = buildServicesConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(servicesSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function buildServicesConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootServiceOverrides(env, overrides);
  applyDefaultRetryOverrides(env, overrides);
  applyKnownServiceOverrides(env, overrides);
  applyCloudflareServiceBindingOverrides(env, overrides);
  applyQueueOverrides(env, overrides);
  applyServicesEnabledDerivedOverrides(env, overrides);

  return overrides;
}

export function resolveServicesConfigProfile(
  env: EnvRecord,
  profile: ServicesConfigProfile = 'auto',
): ResolvedServicesConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const explicitRuntime = getEnv(env, 'APP_RUNTIME') ?? getEnv(env, 'HELIX_RUNTIME');

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

export function resolveServicesConfigDefaults(
  profile: ResolvedServicesConfigProfile,
): ServicesConfig {
  if (profile === 'cloudflare') {
    return deepClone(defaultCloudflareServicesConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalServicesConfig);
  }

  return deepClone(defaultServicesConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createServicesConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const servicesConfig = createServicesConfig();

export default servicesConfig;

function applyRootServiceOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'SERVICES_ENABLED', 'enabled');
  applyOptionalInteger(
    env,
    overrides,
    'SERVICES_DEFAULT_TIMEOUT_MS',
    'defaultTimeoutMs',
  );
}

function applyDefaultRetryOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(
    env,
    overrides,
    'SERVICES_DEFAULT_RETRY_ENABLED',
    'defaultRetry.enabled',
  );

  applyOptionalInteger(
    env,
    overrides,
    'SERVICES_DEFAULT_RETRY_ATTEMPTS',
    'defaultRetry.attempts',
  );

  applyOptionalInteger(
    env,
    overrides,
    'SERVICES_DEFAULT_RETRY_INITIAL_DELAY_MS',
    'defaultRetry.initialDelayMs',
  );

  applyOptionalInteger(
    env,
    overrides,
    'SERVICES_DEFAULT_RETRY_MAX_DELAY_MS',
    'defaultRetry.maxDelayMs',
  );

  applyOptionalInteger(
    env,
    overrides,
    'SERVICES_DEFAULT_RETRY_BACKOFF_MULTIPLIER',
    'defaultRetry.backoffMultiplier',
  );
}

function applyKnownServiceOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  for (const service of knownServices) {
    applySingleServiceOverrides(env, overrides, service);
  }
}

function applySingleServiceOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  service: KnownServiceConfig,
): void {
  const basePath = `registry.${service.key}`;
  const prefix = service.envPrefix;

  applyOptionalBoolean(env, overrides, `${prefix}_ENABLED`, `${basePath}.enabled`);
  applyOptionalString(env, overrides, `${prefix}_NAME`, `${basePath}.name`);
  applyOptionalString(
    env,
    overrides,
    `${prefix}_DISPLAY_NAME`,
    `${basePath}.displayName`,
  );
  applyOptionalString(env, overrides, `${prefix}_RUNTIME`, `${basePath}.runtime`);
  applyOptionalString(
    env,
    overrides,
    `${prefix}_VERSION`,
    `${basePath}.version`,
  );
  applyOptionalString(
    env,
    overrides,
    `${prefix}_ENVIRONMENT`,
    `${basePath}.environment`,
  );
  applyOptionalString(env, overrides, `${prefix}_OWNER`, `${basePath}.owner`);
  applyOptionalString(
    env,
    overrides,
    `${prefix}_DESCRIPTION`,
    `${basePath}.description`,
  );
  applyOptionalString(
    env,
    overrides,
    `${prefix}_EXPOSURE`,
    `${basePath}.exposure`,
  );

  applyServiceEndpointOverrides(env, overrides, service, 'PUBLIC', 'public');
  applyServiceEndpointOverrides(env, overrides, service, 'INTERNAL', 'internal');
  applyServiceEndpointOverrides(env, overrides, service, 'HEALTH', 'health');
  applyServiceEndpointOverrides(
    env,
    overrides,
    service,
    'INTERACTIONS',
    'interactions',
  );

  applyOptionalBoolean(
    env,
    overrides,
    `${prefix}_RETRY_ENABLED`,
    `${basePath}.retry.enabled`,
  );
  applyOptionalInteger(
    env,
    overrides,
    `${prefix}_RETRY_ATTEMPTS`,
    `${basePath}.retry.attempts`,
  );
  applyOptionalInteger(
    env,
    overrides,
    `${prefix}_RETRY_INITIAL_DELAY_MS`,
    `${basePath}.retry.initialDelayMs`,
  );
  applyOptionalInteger(
    env,
    overrides,
    `${prefix}_RETRY_MAX_DELAY_MS`,
    `${basePath}.retry.maxDelayMs`,
  );
  applyOptionalInteger(
    env,
    overrides,
    `${prefix}_RETRY_BACKOFF_MULTIPLIER`,
    `${basePath}.retry.backoffMultiplier`,
  );

  applyOptionalBoolean(
    env,
    overrides,
    `${prefix}_RATE_LIMIT_ENABLED`,
    `${basePath}.rateLimit.enabled`,
  );
  applyOptionalInteger(
    env,
    overrides,
    `${prefix}_RATE_LIMIT_LIMIT`,
    `${basePath}.rateLimit.limit`,
  );
  applyOptionalInteger(
    env,
    overrides,
    `${prefix}_RATE_LIMIT_WINDOW_SECONDS`,
    `${basePath}.rateLimit.windowSeconds`,
  );
  applyOptionalString(
    env,
    overrides,
    `${prefix}_RATE_LIMIT_KEY_BY`,
    `${basePath}.rateLimit.keyBy`,
  );

  applyOptionalList(
    env,
    overrides,
    `${prefix}_REQUIRED_CONFIG_KEYS`,
    `${basePath}.requiredConfigKeys`,
  );
  applyOptionalList(
    env,
    overrides,
    `${prefix}_REQUIRED_SECRET_REFS`,
    `${basePath}.requiredSecretRefs`,
  );
  applyOptionalList(env, overrides, `${prefix}_TAGS`, `${basePath}.tags`);

  if (hasServiceSignal(env, prefix)) {
    setDeepValue(overrides, `${basePath}.name`, service.key);
  }
}

function applyServiceEndpointOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  service: KnownServiceConfig,
  endpointEnvName: string,
  endpointKey: string,
): void {
  const prefix = service.envPrefix;
  const basePath = `registry.${service.key}.endpoints.${endpointKey}`;
  const envPrefix = `${prefix}_${endpointEnvName}_ENDPOINT`;

  const name = getEnv(env, `${envPrefix}_NAME`);
  const protocol = getEnv(env, `${envPrefix}_PROTOCOL`);
  const url = getEnv(env, `${envPrefix}_URL`);
  const basePathValue = getEnv(env, `${envPrefix}_BASE_PATH`);
  const healthPath = getEnv(env, `${envPrefix}_HEALTH_PATH`);
  const timeoutMs = getEnvInteger(env, `${envPrefix}_TIMEOUT_MS`);
  const exposure = getEnv(env, `${envPrefix}_EXPOSURE`);
  const requiredSecretRefs = getEnvList(env, `${envPrefix}_REQUIRED_SECRET_REFS`);

  if (
    name === undefined &&
    protocol === undefined &&
    url === undefined &&
    basePathValue === undefined &&
    healthPath === undefined &&
    timeoutMs === undefined &&
    exposure === undefined &&
    requiredSecretRefs.length === 0
  ) {
    return;
  }

  setDeepValue(overrides, `${basePath}.name`, name ?? endpointKey);

  if (protocol !== undefined) {
    setDeepValue(overrides, `${basePath}.protocol`, protocol);
  }

  if (url !== undefined) {
    setDeepValue(overrides, `${basePath}.url`, url);
  }

  if (basePathValue !== undefined) {
    setDeepValue(overrides, `${basePath}.basePath`, basePathValue);
  }

  if (healthPath !== undefined) {
    setDeepValue(overrides, `${basePath}.healthPath`, healthPath);
  }

  if (timeoutMs !== undefined) {
    setDeepValue(overrides, `${basePath}.timeoutMs`, timeoutMs);
  }

  if (exposure !== undefined) {
    setDeepValue(overrides, `${basePath}.exposure`, exposure);
  }

  if (requiredSecretRefs.length > 0) {
    setDeepValue(overrides, `${basePath}.requiredSecretRefs`, requiredSecretRefs);
  }
}

function applyCloudflareServiceBindingOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyServiceBindingOverride(env, overrides, {
    serviceKey: 'api-gateway',
    envPrefix: 'API_GATEWAY_SERVICE',
    defaultBinding: 'API_GATEWAY_SERVICE',
    defaultService: 'helix-api-gateway',
    defaultEntrypoint: 'ApiGatewayService',
  });

  applyServiceBindingOverride(env, overrides, {
    serviceKey: 'auth',
    envPrefix: 'AUTH_SERVICE',
    defaultBinding: 'AUTH_SERVICE',
    defaultService: 'helix-auth-service',
    defaultEntrypoint: 'AuthService',
  });

  applyServiceBindingOverride(env, overrides, {
    serviceKey: 'users',
    envPrefix: 'USER_SERVICE',
    defaultBinding: 'USER_SERVICE',
    defaultService: 'helix-user-service',
    defaultEntrypoint: 'UserService',
  });
}

function applyServiceBindingOverride(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  options: {
    serviceKey: string;
    envPrefix: string;
    defaultBinding: string;
    defaultService: string;
    defaultEntrypoint: string;
  },
): void {
  const binding =
    getEnv(env, `${options.envPrefix}_BINDING`) ?? options.defaultBinding;
  const service =
    getEnv(env, `${options.envPrefix}_WORKER`) ??
    getEnv(env, `${options.envPrefix}_SERVICE`) ??
    options.defaultService;
  const entrypoint =
    getEnv(env, `${options.envPrefix}_ENTRYPOINT`) ?? options.defaultEntrypoint;
  const rpcEnabled = getEnvBoolean(env, `${options.envPrefix}_RPC_ENABLED`);

  const shouldApply =
    isCloudflareEnv(env) ||
    getEnv(env, `${options.envPrefix}_BINDING`) !== undefined ||
    getEnv(env, `${options.envPrefix}_WORKER`) !== undefined ||
    getEnv(env, `${options.envPrefix}_SERVICE`) !== undefined ||
    getEnv(env, `${options.envPrefix}_ENTRYPOINT`) !== undefined ||
    rpcEnabled !== undefined;

  if (!shouldApply) {
    return;
  }

  const basePath = `registry.${options.serviceKey}.cloudflareBinding`;

  setDeepValue(overrides, basePath, {
    binding,
    service,
    entrypoint,
    rpcEnabled: rpcEnabled ?? true,
  });
}

function applyQueueOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const queueName = getEnv(env, 'HELIX_EVENTS_QUEUE_NAME');
  const binding = getEnv(env, 'HELIX_EVENTS_QUEUE_BINDING');
  const eventTypes = getEnvList(env, 'HELIX_EVENTS_QUEUE_EVENT_TYPES');
  const consumes = getEnvBoolean(env, 'HELIX_EVENTS_QUEUE_CONSUMES');
  const publishes = getEnvBoolean(env, 'HELIX_EVENTS_QUEUE_PUBLISHES');

  if (
    queueName === undefined &&
    binding === undefined &&
    eventTypes.length === 0 &&
    consumes === undefined &&
    publishes === undefined
  ) {
    return;
  }

  const queueConfig = {
    name: 'events',
    binding: binding ?? 'HELIX_EVENTS_QUEUE',
    queue: queueName ?? 'helix-events',
    eventTypes:
      eventTypes.length > 0
        ? eventTypes
        : [
            'user.created',
            'user.updated',
            'assistant.message.created',
            'automation.requested',
            'audit.event.created',
          ],
    consumes: consumes ?? true,
    publishes: publishes ?? true,
  };

  setDeepValue(overrides, 'registry.api-gateway.queues.events', {
    ...queueConfig,
    consumes: false,
    publishes: true,
  });

  setDeepValue(overrides, 'registry.events.queues.events', queueConfig);

  setDeepValue(overrides, 'registry.discord.queues.events', {
    ...queueConfig,
    consumes: false,
    publishes: true,
    eventTypes:
      eventTypes.length > 0
        ? eventTypes
        : [
            'discord.interaction.received',
            'discord.command.executed',
            'discord.webhook.received',
          ],
  });
}

function applyServicesEnabledDerivedOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (getEnvBoolean(env, 'SERVICES_ENABLED') !== undefined) {
    return;
  }

  if (
    isCloudflareEnv(env) ||
    knownServices.some((service) => hasServiceSignal(env, service.envPrefix)) ||
    getEnv(env, 'HELIX_EVENTS_QUEUE_NAME') ||
    getEnv(env, 'HELIX_EVENTS_QUEUE_BINDING')
  ) {
    setDeepValue(overrides, 'enabled', true);
  }
}

function hasServiceSignal(env: EnvRecord, prefix: string): boolean {
  return Boolean(
    getEnv(env, `${prefix}_ENABLED`) ||
      getEnv(env, `${prefix}_NAME`) ||
      getEnv(env, `${prefix}_DISPLAY_NAME`) ||
      getEnv(env, `${prefix}_RUNTIME`) ||
      getEnv(env, `${prefix}_VERSION`) ||
      getEnv(env, `${prefix}_ENVIRONMENT`) ||
      getEnv(env, `${prefix}_OWNER`) ||
      getEnv(env, `${prefix}_DESCRIPTION`) ||
      getEnv(env, `${prefix}_EXPOSURE`) ||
      getEnv(env, `${prefix}_REQUIRED_CONFIG_KEYS`) ||
      getEnv(env, `${prefix}_REQUIRED_SECRET_REFS`) ||
      getEnv(env, `${prefix}_TAGS`),
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
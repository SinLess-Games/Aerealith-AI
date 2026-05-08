import type { AppConfig } from '../types/app';

import {
  defaultAppConfig,
  defaultCloudflareAppConfig,
  defaultLocalAppConfig,
} from '../defaults/app.defaults';
import { appSchema } from '../schema/app.schema';
import {
  deepClone,
  deepMerge,
  setDeepValue,
  type DeepMergeOptions,
} from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvList,
  getFirstEnv,
  getPublicEnv,
  isCloudflareEnv,
  isPublicEnvKey,
  mapEnvToObject,
  parseEnvBoolean,
  parseEnvInteger,
  resolveAppEnvironment,
  type EnvPathMapping,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
  type ValidationIssue,
  type ValidationResult,
} from '../utils/validation';

export type EnvConfigProfile = 'default' | 'local' | 'cloudflare' | 'auto';

export type ResolvedEnvConfigProfile = Exclude<EnvConfigProfile, 'auto'>;

export type LoadConfigFromEnvOptions = {
  /**
   * Selects the default baseline before env overrides are applied.
   *
   * auto:
   *   cloudflare when Cloudflare markers are present
   *   local when APP_ENV/NODE_ENV resolves to development/test
   *   default otherwise
   */
  profile?: EnvConfigProfile;

  /**
   * Human-readable name used in validation errors.
   */
  name?: string;

  /**
   * Array merge behavior used when applying env overrides.
   */
  arrayStrategy?: DeepMergeOptions['arrayStrategy'];

  /**
   * Whether undefined values in the env-derived override object should
   * overwrite defaults.
   */
  undefinedStrategy?: DeepMergeOptions['undefinedStrategy'];

  /**
   * Include NEXT_PUBLIC_* and PUBLIC_* values in the result metadata.
   *
   * These are not automatically merged into config except for known safe
   * publicRuntime fields.
   */
  includePublicEnv?: boolean;

  /**
   * Whether empty env input is allowed.
   */
  allowEmpty?: boolean;
};

export type LoadConfigFromEnvResult = {
  config: AppConfig;
  profile: ResolvedEnvConfigProfile;
  defaults: AppConfig;
  overrides: Record<string, unknown>;
  publicEnv: Record<string, string>;
};

export class EnvConfigParseError extends Error {
  public override readonly name = 'EnvConfigParseError';

  public readonly configName: string;

  public readonly issues: ValidationIssue[];

  public constructor(configName: string, issues: ValidationIssue[]) {
    super(createEnvConfigErrorMessage(configName, issues));

    this.configName = configName;
    this.issues = issues;
  }
}

const envConfigMappings = [
  {
    env: ['APP_ENV', 'NODE_ENV', 'ENVIRONMENT'],
    path: 'environment',
  },
  {
    env: ['APP_RUNTIME', 'HELIX_RUNTIME'],
    path: 'runtime',
  },
  {
    env: ['APP_NAME', 'HELIX_APP_NAME'],
    path: 'app.displayName',
  },
  {
    env: ['APP_ID', 'HELIX_APP_ID'],
    path: 'app.name',
  },
  {
    env: ['APP_VERSION', 'NEXT_PUBLIC_APP_VERSION'],
    path: 'app.version',
  },
  {
    env: ['APP_RELEASE', 'NEXT_PUBLIC_APP_RELEASE', 'CF_PAGES_COMMIT_SHA'],
    path: 'app.release',
  },
  {
    env: ['APP_OWNER'],
    path: 'app.owner',
  },
  {
    env: ['APP_URL', 'NEXTAUTH_URL', 'AUTH_URL', 'NEXT_PUBLIC_APP_URL'],
    path: 'app.url',
  },
  {
    env: ['APP_DOMAIN', 'PRIMARY_DOMAIN'],
    path: 'app.domain',
  },

  {
    env: ['PUBLIC_APP_NAME', 'NEXT_PUBLIC_APP_NAME', 'APP_NAME'],
    path: 'publicRuntime.appName',
  },
  {
    env: ['PUBLIC_APP_URL', 'NEXT_PUBLIC_APP_URL', 'APP_URL'],
    path: 'publicRuntime.appUrl',
  },
  {
    env: ['APP_ENV', 'NODE_ENV', 'ENVIRONMENT'],
    path: 'publicRuntime.environment',
  },
  {
    env: ['PUBLIC_RELEASE', 'NEXT_PUBLIC_APP_RELEASE', 'CF_PAGES_COMMIT_SHA'],
    path: 'publicRuntime.release',
  },
  {
    env: ['NEXT_PUBLIC_FARO_URL', 'PUBLIC_FARO_URL'],
    path: 'publicRuntime.faroUrl',
  },
  {
    env: ['NEXT_PUBLIC_DISCORD_APPLICATION_ID'],
    path: 'publicRuntime.discordApplicationId',
  },
  {
    env: ['NEXT_PUBLIC_GITHUB_CLIENT_ID', 'GITHUB_CLIENT_ID'],
    path: 'publicRuntime.githubClientId',
  },
  {
    env: ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID'],
    path: 'publicRuntime.googleClientId',
  },
  {
    env: ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'TURNSTILE_SITE_KEY'],
    path: 'publicRuntime.turnstileSiteKey',
  },

  {
    env: ['CLOUDFLARE_ACCOUNT_ID'],
    path: 'cloudflare.account.accountId',
  },
  {
    env: ['CLOUDFLARE_API_TOKEN_REF'],
    path: 'cloudflare.account.apiTokenRef',
  },
  {
    env: ['CLOUDFLARE_ZONE_ID'],
    path: 'cloudflare.account.zoneId',
  },
  {
    env: ['CLOUDFLARE_ZONE_NAME', 'APP_DOMAIN', 'PRIMARY_DOMAIN'],
    path: 'cloudflare.account.zoneName',
  },
  {
    env: ['CLOUDFLARE_WORKER_NAME', 'WORKER_NAME'],
    path: 'cloudflare.worker.name',
  },
  {
    env: ['CLOUDFLARE_WORKER_RUNTIME', 'WORKER_RUNTIME'],
    path: 'cloudflare.worker.runtime',
  },
  {
    env: ['CLOUDFLARE_WORKER_MAIN', 'WORKER_MAIN'],
    path: 'cloudflare.worker.main',
  },
  {
    env: ['CLOUDFLARE_COMPATIBILITY_DATE'],
    path: 'cloudflare.worker.compatibilityDate',
  },

  {
    env: ['DATABASE_URL_REF'],
    path: 'database.urlRef',
  },
  {
    env: ['DATABASE_PROVIDER'],
    path: 'database.provider',
  },

  {
    env: ['REDIS_URL_REF'],
    path: 'redis.url',
  },
  {
    env: ['REDIS_HOST'],
    path: 'redis.host',
  },
  {
    env: ['REDIS_USERNAME'],
    path: 'redis.username',
  },
  {
    env: ['REDIS_CACHE_PREFIX'],
    path: 'redis.cachePrefix',
  },

  {
    env: ['GITHUB_CLIENT_ID'],
    path: 'github.clientId',
  },
  {
    env: ['GITHUB_REDIRECT_URI'],
    path: 'github.redirectUri',
  },
  {
    env: ['GITHUB_REPO_URL'],
    path: 'github.repoUrl',
  },
  {
    env: ['GITHUB_REPOSITORY_OWNER'],
    path: 'github.repository.owner',
  },
  {
    env: ['GITHUB_REPOSITORY_NAME'],
    path: 'github.repository.name',
  },
  {
    env: ['GITHUB_REPOSITORY'],
    path: 'github.repository.fullName',
  },
  {
    env: ['GITHUB_REPOSITORY_URL'],
    path: 'github.repository.url',
  },
  {
    env: ['GITHUB_DEFAULT_BRANCH'],
    path: 'github.repository.defaultBranch',
  },

  {
    env: ['GRAFANA_CLOUD_STACK_NAME'],
    path: 'grafanaCloud.api.stackName',
  },
  {
    env: ['GRAFANA_CLOUD_REGION'],
    path: 'grafanaCloud.api.region',
  },
  {
    env: ['GRAFANA_CLOUD_STACK_URL'],
    path: 'grafanaCloud.api.stackUrl',
  },
  {
    env: ['GRAFANA_CLOUD_API_TOKEN_REF'],
    path: 'grafanaCloud.api.apiTokenRef',
  },
  {
    env: ['NEXT_PUBLIC_FARO_URL', 'PUBLIC_FARO_URL'],
    path: 'grafanaCloud.addons.faro.url',
  },
  {
    env: ['NEXT_PUBLIC_FARO_URL', 'PUBLIC_FARO_URL'],
    path: 'grafanaCloud.addons.faro.publicUrl',
  },

  {
    env: ['AUTH_SECRET_REF'],
    path: 'auth.nextAuth.secretRef',
  },
  {
    env: ['NEXTAUTH_URL', 'AUTH_URL', 'APP_URL'],
    path: 'auth.nextAuth.url',
  },
  {
    env: ['GOOGLE_CLIENT_ID'],
    path: 'auth.google.clientId',
  },
  {
    env: ['GOOGLE_CLIENT_ID_REF'],
    path: 'auth.google.clientIdRef',
  },
  {
    env: ['GOOGLE_CLIENT_SECRET_REF'],
    path: 'auth.google.clientSecretRef',
  },
  {
    env: ['GOOGLE_REDIRECT_URI'],
    path: 'auth.google.redirectUri',
  },
  {
    env: ['GITHUB_CLIENT_ID'],
    path: 'auth.github.clientId',
  },
  {
    env: ['GITHUB_CLIENT_ID_REF'],
    path: 'auth.github.clientIdRef',
  },
  {
    env: ['GITHUB_CLIENT_SECRET_REF'],
    path: 'auth.github.clientSecretRef',
  },
  {
    env: ['GITHUB_REDIRECT_URI'],
    path: 'auth.github.redirectUri',
  },
  {
    env: ['DISCORD_CLIENT_ID'],
    path: 'auth.discord.clientId',
  },
  {
    env: ['DISCORD_CLIENT_ID_REF'],
    path: 'auth.discord.clientIdRef',
  },
  {
    env: ['DISCORD_CLIENT_SECRET_REF'],
    path: 'auth.discord.clientSecretRef',
  },
  {
    env: ['DISCORD_REDIRECT_URI'],
    path: 'auth.discord.redirectUri',
  },

  {
    env: ['DISCORD_API_BASE_URL'],
    path: 'discord.apiBaseUrl',
  },
  {
    env: ['DISCORD_WEB_BASE_URL'],
    path: 'discord.webBaseUrl',
  },
  {
    env: ['DISCORD_CLIENT_SECRET_REF'],
    path: 'discord.oauth.clientSecretRef',
  },
  {
    env: ['DISCORD_REDIRECT_URI'],
    path: 'discord.oauth.redirectUri',
  },
  {
    env: ['DISCORD_APPLICATION_ID'],
    path: 'discord.bot.applicationId',
  },
  {
    env: ['DISCORD_BOT_USER_ID'],
    path: 'discord.bot.botUserId',
  },
  {
    env: ['DISCORD_PUBLIC_KEY'],
    path: 'discord.bot.publicKey',
  },
  {
    env: ['DISCORD_BOT_TOKEN_REF'],
    path: 'discord.bot.tokenRef',
  },
  {
    env: ['DISCORD_INTERACTIONS_ENDPOINT_URL'],
    path: 'discord.interactions.endpointUrl',
  },
  {
    env: ['DISCORD_INTERACTIONS_ENDPOINT_PATH'],
    path: 'discord.interactions.endpointPath',
  },

  {
    env: ['OTEL_SERVICE_NAME'],
    path: 'telemetry.otel.serviceName',
  },
  {
    env: ['OTEL_TRACES_EXPORTER'],
    path: 'telemetry.otel.tracesExporter',
  },
  {
    env: ['OTEL_METRICS_EXPORTER'],
    path: 'telemetry.otel.metricsExporter',
  },
  {
    env: ['OTEL_LOGS_EXPORTER'],
    path: 'telemetry.otel.logsExporter',
  },
  {
    env: ['OTEL_EXPORTER_OTLP_ENDPOINT'],
    path: 'telemetry.otel.endpoint',
  },
  {
    env: ['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'],
    path: 'telemetry.otel.tracesEndpoint',
  },
  {
    env: ['OTEL_EXPORTER_OTLP_METRICS_ENDPOINT'],
    path: 'telemetry.otel.metricsEndpoint',
  },
  {
    env: ['OTEL_EXPORTER_OTLP_LOGS_ENDPOINT'],
    path: 'telemetry.otel.logsEndpoint',
  },
  {
    env: ['OTEL_EXPORTER_OTLP_HEADERS'],
    path: 'telemetry.otel.headers',
  },
  {
    env: ['OTEL_RESOURCE_ATTRIBUTES'],
    path: 'telemetry.otel.resourceAttributes',
  },
] satisfies readonly EnvPathMapping[];

export function loadConfigFromEnv(
  env: EnvRecord,
  options: LoadConfigFromEnvOptions = {},
): AppConfig {
  return loadConfigFromEnvDetailed(env, options).config;
}

export function loadConfigFromEnvDetailed(
  env: EnvRecord,
  options: LoadConfigFromEnvOptions = {},
): LoadConfigFromEnvResult {
  const configName = options.name ?? 'env config';

  assertEnvInput(env, {
    name: configName,
    allowEmpty: options.allowEmpty ?? true,
  });

  const profile = resolveEnvConfigProfile(env, options.profile ?? 'auto');
  const defaults = resolveEnvConfigDefaults(profile);
  const overrides = buildEnvConfigOverrides(env, profile);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: options.arrayStrategy ?? 'replace',
    undefinedStrategy: options.undefinedStrategy ?? 'ignore',
  });

  const validation = safeValidateConfig(appSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return {
    config: validation.data as AppConfig,
    profile,
    defaults,
    overrides,
    publicEnv: options.includePublicEnv === false ? {} : getPublicEnv(env),
  };
}

export function safeLoadConfigFromEnv(
  env: EnvRecord,
  options: LoadConfigFromEnvOptions = {},
): ValidationResult<AppConfig> {
  try {
    const result = loadConfigFromEnvDetailed(env, options);

    return {
      success: true,
      data: result.config,
      issues: [],
      error: undefined,
      message: undefined,
    };
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return {
        success: false,
        data: undefined,
        issues: error.issues,
        error: error.zodError,
        message: error.message,
      };
    }

    throw error;
  }
}

export function buildEnvConfigOverrides(
  env: EnvRecord,
  profile: ResolvedEnvConfigProfile = resolveEnvConfigProfile(env),
): Record<string, unknown> {
  const overrides = mapEnvToObject(env, envConfigMappings);

  applyDerivedAppEnvironment(env, overrides, profile);
  applyBooleanOverrides(env, overrides);
  applyNumberOverrides(env, overrides);
  applyListOverrides(env, overrides);
  applyCloudflareOverrides(env, overrides, profile);
  applyDatabaseOverrides(env, overrides);
  applyRedisOverrides(env, overrides);
  applyAuthOverrides(env, overrides);
  applyDiscordOverrides(env, overrides);
  applyGrafanaCloudOverrides(env, overrides);
  applyStorageOverrides(env, overrides);
  applySecurityOverrides(env, overrides);

  return overrides;
}

export function resolveEnvConfigProfile(
  env: EnvRecord,
  profile: EnvConfigProfile = 'auto',
): ResolvedEnvConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const explicitRuntime = getFirstEnv(env, ['APP_RUNTIME', 'HELIX_RUNTIME']);

  if (explicitRuntime === 'cloudflare-worker') {
    return 'cloudflare';
  }

  if (isCloudflareEnv(env)) {
    return 'cloudflare';
  }

  const environment = resolveAppEnvironment(env);

  if (environment === 'development' || environment === 'test') {
    return 'local';
  }

  return 'default';
}

export function resolveEnvConfigDefaults(
  profile: ResolvedEnvConfigProfile,
): AppConfig {
  if (profile === 'cloudflare') {
    return deepClone(defaultCloudflareAppConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalAppConfig);
  }

  return deepClone(defaultAppConfig);
}

export function validateEnvConfig(
  env: EnvRecord,
  options: LoadConfigFromEnvOptions = {},
): AppConfig {
  const profile = resolveEnvConfigProfile(env, options.profile ?? 'auto');
  const defaults = resolveEnvConfigDefaults(profile);
  const overrides = buildEnvConfigOverrides(env, profile);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: options.arrayStrategy ?? 'replace',
    undefinedStrategy: options.undefinedStrategy ?? 'ignore',
  });

  const validation = safeValidateConfig(appSchema, mergedConfig, {
    name: options.name ?? 'env config',
  });

  if (!validation.success) {
    throw new ConfigValidationError(options.name ?? 'env config', validation.error);
  }

  return validation.data as AppConfig;
}

export function getKnownConfigEnvKeys(): string[] {
  const keys = new Set<string>();

  for (const mapping of envConfigMappings) {
    const mappingKeys = Array.isArray(mapping.env) ? mapping.env : [mapping.env];

    for (const key of mappingKeys) {
      keys.add(key);
    }
  }

  return [...keys].sort();
}

export function getUnknownPublicEnvKeys(env: EnvRecord): string[] {
  return Object.keys(env)
    .filter((key) => isPublicEnvKey(key))
    .filter((key) => !getKnownConfigEnvKeys().includes(key))
    .sort();
}

function applyDerivedAppEnvironment(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  profile: ResolvedEnvConfigProfile,
): void {
  const environment = resolveAppEnvironment(env);

  setDeepValue(overrides, 'environment', environment);
  setDeepValue(overrides, 'publicRuntime.environment', environment);

  const runtime =
    getFirstEnv(env, ['APP_RUNTIME', 'HELIX_RUNTIME']) ??
    (profile === 'cloudflare' || isCloudflareEnv(env)
      ? 'cloudflare-worker'
      : profile === 'local'
        ? 'nodejs'
        : 'nodejs');

  setDeepValue(overrides, 'runtime', runtime);

  if (environment === 'production') {
    setDeepValue(overrides, 'security.environment', 'production');
  }

  if (profile === 'cloudflare' || isCloudflareEnv(env)) {
    setDeepValue(overrides, 'runtime', 'cloudflare-worker');
    setDeepValue(overrides, 'cloudflare.enabled', true);
    setDeepValue(overrides, 'cloudflare.defaultEnvironment', environment);
    setDeepValue(overrides, 'cloudflare.worker.runtime', 'cloudflare-worker');
  }
}

function applyBooleanOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'CLOUDFLARE_ENABLED', 'cloudflare.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'CLOUDFLARE_WORKERS_DEV',
    'cloudflare.worker.workersDev',
  );
  applyOptionalBoolean(env, overrides, 'CLOUDFLARE_CI_ENABLED', 'cloudflare.ci.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'CLOUDFLARE_PRODUCTION_APPROVAL_REQUIRED',
    'cloudflare.ci.productionApprovalRequired',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'CLOUDFLARE_GRADUAL_DEPLOYMENTS_ENABLED',
    'cloudflare.ci.gradualDeploymentsEnabled',
  );

  applyOptionalBoolean(env, overrides, 'DATABASE_ENABLED', 'database.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'DATABASE_MIGRATIONS_ENABLED',
    'database.instances.primary.migrations.enabled',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DATABASE_DESTRUCTIVE_MIGRATIONS_ALLOWED',
    'database.instances.primary.migrations.destructiveAllowed',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DATABASE_MIGRATIONS_REQUIRE_APPROVAL',
    'database.instances.primary.migrations.requireApproval',
  );

  applyOptionalBoolean(env, overrides, 'REDIS_ENABLED', 'redis.enabled');

  applyOptionalBoolean(env, overrides, 'AUTH_ENABLED', 'auth.enabled');
  applyOptionalBoolean(env, overrides, 'AUTHJS_ENABLED', 'auth.nextAuth.enabled');
  applyOptionalBoolean(env, overrides, 'AUTH_TRUST_HOST', 'auth.nextAuth.trustHost');
  applyOptionalBoolean(env, overrides, 'GOOGLE_AUTH_ENABLED', 'auth.google.enabled');
  applyOptionalBoolean(env, overrides, 'GITHUB_AUTH_ENABLED', 'auth.github.enabled');
  applyOptionalBoolean(env, overrides, 'DISCORD_AUTH_ENABLED', 'auth.discord.enabled');
  applyOptionalBoolean(env, overrides, 'API_KEYS_ENABLED', 'auth.apiKeys.enabled');

  applyOptionalBoolean(env, overrides, 'DISCORD_ENABLED', 'discord.enabled');
  applyOptionalBoolean(env, overrides, 'DISCORD_BOT_ENABLED', 'discord.bot.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_INTERACTIONS_ENABLED',
    'discord.interactions.enabled',
  );
  applyOptionalBoolean(env, overrides, 'DISCORD_GATEWAY_ENABLED', 'discord.gateway.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_VERIFY_SIGNATURES',
    'discord.interactions.verifySignatures',
  );

  applyOptionalBoolean(env, overrides, 'GRAFANA_CLOUD_ENABLED', 'grafanaCloud.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'GRAFANA_CLOUD_API_ENABLED',
    'grafanaCloud.api.enabled',
  );
  applyOptionalBoolean(env, overrides, 'FARO_ENABLED', 'grafanaCloud.addons.faro.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'FARO_SESSION_TRACKING_ENABLED',
    'grafanaCloud.addons.faro.sessionTracking.enabled',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'FARO_TRACING_ENABLED',
    'grafanaCloud.addons.faro.tracing.enabled',
  );

  applyOptionalBoolean(env, overrides, 'TELEMETRY_ENABLED', 'telemetry.enabled');
  applyOptionalBoolean(env, overrides, 'OTEL_ENABLED', 'telemetry.otel.enabled');
  applyOptionalBoolean(env, overrides, 'NEXT_PUBLIC_FARO_ENABLED', 'telemetry.faro.enabled');
  applyOptionalBoolean(env, overrides, 'FARO_TRACING_ENABLED', 'telemetry.faro.tracingEnabled');

  applyOptionalBoolean(env, overrides, 'STORAGE_ENABLED', 'storage.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'SIGNED_UPLOADS_ENABLED',
    'storage.signedUploadsEnabled',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'WORKER_MEDIATED_DOWNLOADS_ENABLED',
    'storage.workerMediatedDownloadsEnabled',
  );

  applyOptionalBoolean(env, overrides, 'SECURITY_ENABLED', 'security.enabled');
  applyOptionalBoolean(env, overrides, 'CORS_ENABLED', 'security.cors.enabled');
  applyOptionalBoolean(env, overrides, 'RATE_LIMIT_ENABLED', 'security.rateLimit.enabled');
  applyOptionalBoolean(env, overrides, 'AUDIT_ENABLED', 'security.audit.enabled');
  applyOptionalBoolean(env, overrides, 'ENCRYPTION_ENABLED', 'security.encryption.enabled');

  applyOptionalBoolean(env, overrides, 'SERVICES_ENABLED', 'services.enabled');
}

function applyNumberOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_PORT',
    'database.instances.primary.connection.port',
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_POOL_MIN',
    'database.instances.primary.connection.pool.min',
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_POOL_MAX',
    'database.instances.primary.connection.pool.max',
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_CONNECT_TIMEOUT_MS',
    'database.instances.primary.connection.connectTimeoutMs',
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_STATEMENT_TIMEOUT_MS',
    'database.instances.primary.connection.statementTimeoutMs',
  );

  applyOptionalInteger(env, overrides, 'REDIS_PORT', 'redis.port');
  applyOptionalInteger(env, overrides, 'REDIS_CACHE_EXPIRATION_MS', 'redis.cacheExpirationMs');

  applyOptionalInteger(
    env,
    overrides,
    'AUTH_SESSION_MAX_AGE_SECONDS',
    'auth.nextAuth.sessionMaxAgeSeconds',
  );
  applyOptionalInteger(
    env,
    overrides,
    'AUTH_SESSION_UPDATE_AGE_SECONDS',
    'auth.nextAuth.sessionUpdateAgeSeconds',
  );
  applyOptionalInteger(
    env,
    overrides,
    'API_KEY_DEFAULT_EXPIRATION_DAYS',
    'auth.apiKeys.defaultExpirationDays',
  );

  applyOptionalInteger(
    env,
    overrides,
    'DISCORD_INITIAL_RESPONSE_TIMEOUT_MS',
    'discord.interactions.initialResponseTimeoutMs',
  );
  applyOptionalInteger(env, overrides, 'DISCORD_SHARD_COUNT', 'discord.gateway.shardCount');

  applyOptionalInteger(
    env,
    overrides,
    'FARO_MAX_SESSION_PERSISTENCE_TIME_MS',
    'grafanaCloud.addons.faro.sessionTracking.maxSessionPersistenceTimeMs',
  );
  applyOptionalNumber(env, overrides, 'FARO_SAMPLING_RATE', 'grafanaCloud.addons.faro.samplingRate');

  applyOptionalInteger(env, overrides, 'RATE_LIMIT_LIMIT', 'security.rateLimit.limit');
  applyOptionalInteger(env, overrides, 'RATE_LIMIT_WINDOW_SECONDS', 'security.rateLimit.windowSeconds');
  applyOptionalInteger(env, overrides, 'AUDIT_RETENTION_DAYS', 'security.audit.retentionDays');
  applyOptionalInteger(env, overrides, 'ENCRYPTION_ROTATION_DAYS', 'security.encryption.rotationDays');

  applyOptionalInteger(env, overrides, 'SIGNED_URL_TTL_SECONDS', 'storage.signedUrlTtlSeconds');

  applyOptionalInteger(env, overrides, 'SERVICES_DEFAULT_TIMEOUT_MS', 'services.defaultTimeoutMs');
}

function applyListOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalList(env, overrides, 'AUTH_PROVIDERS', 'auth.providers');
  applyOptionalList(env, overrides, 'GOOGLE_AUTH_SCOPES', 'auth.google.scopes');
  applyOptionalList(env, overrides, 'GITHUB_AUTH_SCOPES', 'auth.github.scopes');
  applyOptionalList(env, overrides, 'DISCORD_AUTH_SCOPES', 'auth.discord.scopes');

  applyOptionalList(env, overrides, 'DISCORD_OAUTH_SCOPES', 'discord.oauth.scopes');
  applyOptionalList(env, overrides, 'DISCORD_BOT_SCOPES', 'discord.bot.scopes');
  applyOptionalList(env, overrides, 'DISCORD_GATEWAY_INTENTS', 'discord.gateway.intents');

  applyOptionalList(
    env,
    overrides,
    'CLOUDFLARE_COMPATIBILITY_FLAGS',
    'cloudflare.worker.compatibilityFlags',
  );
  applyOptionalList(
    env,
    overrides,
    'GRAFANA_CLOUD_ENABLED_SIGNALS',
    'grafanaCloud.addons.enabledSignals',
  );
  applyOptionalList(env, overrides, 'FARO_TRACE_URLS', 'grafanaCloud.addons.faro.tracing.traceUrls');
  applyOptionalList(
    env,
    overrides,
    'FARO_PROPAGATE_TRACE_HEADER_CORS_URLS',
    'grafanaCloud.addons.faro.tracing.propagateTraceHeaderCorsUrls',
  );

  applyOptionalList(env, overrides, 'CORS_ALLOWED_ORIGINS', 'security.cors.allowedOrigins');
  applyOptionalList(env, overrides, 'CORS_ALLOWED_METHODS', 'security.cors.allowedMethods');
  applyOptionalList(env, overrides, 'CORS_ALLOWED_HEADERS', 'security.cors.allowedHeaders');
  applyOptionalList(env, overrides, 'CORS_EXPOSED_HEADERS', 'security.cors.exposedHeaders');

  applyOptionalList(env, overrides, 'ENCRYPTION_PREVIOUS_KEY_REFS', 'security.encryption.previousKeyRefs');
}

function applyCloudflareOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  profile: ResolvedEnvConfigProfile,
): void {
  const compatibilityDate = getEnv(env, 'CLOUDFLARE_COMPATIBILITY_DATE');

  if (compatibilityDate) {
    setDeepValue(
      overrides,
      'cloudflare.environments.production.compatibilityDate',
      compatibilityDate,
    );
  }

  const accountIdRef = getEnv(env, 'CLOUDFLARE_ACCOUNT_ID_REF') ?? 'CLOUDFLARE_ACCOUNT_ID';
  const apiTokenRef = getEnv(env, 'CLOUDFLARE_API_TOKEN_REF') ?? 'CLOUDFLARE_API_TOKEN';

  setDeepValue(overrides, 'cloudflare.ci.accountIdRef', accountIdRef);
  setDeepValue(overrides, 'cloudflare.ci.apiTokenRef', apiTokenRef);

  const domain = getFirstEnv(env, ['APP_DOMAIN', 'PRIMARY_DOMAIN', 'CLOUDFLARE_ZONE_NAME']);

  if (domain) {
    setDeepValue(overrides, 'cloudflare.account.zoneName', domain);
    setDeepValue(overrides, 'cloudflare.worker.metadata.domain', domain);
  }

  const appUrl = getFirstEnv(env, ['APP_URL', 'NEXT_PUBLIC_APP_URL']);

  if (appUrl) {
    setDeepValue(overrides, 'cloudflare.worker.bindings.vars.values.APP_URL', appUrl);
    setDeepValue(overrides, 'cloudflare.worker.bindings.vars.values.PUBLIC_APP_URL', appUrl);
  }

  const workerRuntime =
    getFirstEnv(env, [
      'CLOUDFLARE_WORKER_RUNTIME',
      'WORKER_RUNTIME',
      'APP_RUNTIME',
      'HELIX_RUNTIME',
    ]) ??
    (profile === 'cloudflare' || isCloudflareEnv(env) ? 'cloudflare-worker' : 'nodejs');

  const workerName =
    getFirstEnv(env, ['CLOUDFLARE_WORKER_NAME', 'WORKER_NAME']) ??
    (resolveAppEnvironment(env) === 'production'
      ? 'helix-frontend'
      : 'helix-frontend-dev');

  setDeepValue(overrides, 'cloudflare.worker.runtime', workerRuntime);
  setDeepValue(overrides, 'cloudflare.worker.name', workerName);
}

function applyDatabaseOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const databaseProvider = getEnv(env, 'DATABASE_PROVIDER') ?? 'postgres';
  const databaseUrlRef = getEnv(env, 'DATABASE_URL_REF') ?? 'DATABASE_URL';

  setDeepValue(overrides, 'database.provider', databaseProvider);
  setDeepValue(overrides, 'database.urlRef', databaseUrlRef);
  setDeepValue(overrides, 'database.instances.primary.provider', databaseProvider);
  setDeepValue(overrides, 'database.instances.primary.connection.urlRef', databaseUrlRef);
  setDeepValue(overrides, 'database.instances.primary.requiredSecretRefs', [databaseUrlRef]);

  applyOptionalString(env, overrides, 'DATABASE_HOST', 'database.instances.primary.connection.host');
  applyOptionalString(env, overrides, 'DATABASE_NAME', 'database.instances.primary.connection.database');
  applyOptionalString(env, overrides, 'DATABASE_SCHEMA', 'database.instances.primary.connection.schema');
  applyOptionalString(env, overrides, 'DATABASE_USERNAME', 'database.instances.primary.connection.username');
  applyOptionalString(
    env,
    overrides,
    'DATABASE_USERNAME_REF',
    'database.instances.primary.connection.usernameRef',
  );
  applyOptionalString(
    env,
    overrides,
    'DATABASE_PASSWORD_REF',
    'database.instances.primary.connection.passwordRef',
  );
  applyOptionalString(
    env,
    overrides,
    'DATABASE_CONNECTION_MODE',
    'database.instances.primary.connection.mode',
  );
  applyOptionalString(
    env,
    overrides,
    'DATABASE_SSL_MODE',
    'database.instances.primary.connection.ssl.mode',
  );
  applyOptionalString(
    env,
    overrides,
    'DATABASE_MIGRATION_MODE',
    'database.instances.primary.migrations.mode',
  );
  applyOptionalString(env, overrides, 'DATABASE_REGION', 'database.instances.primary.region');
  applyOptionalString(env, overrides, 'HYPERDRIVE_BINDING', 'database.instances.primary.hyperdrive.binding');
  applyOptionalString(env, overrides, 'HYPERDRIVE_ID', 'database.instances.primary.hyperdrive.id');
}

function applyRedisOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const upstashUrlRef = getEnv(env, 'UPSTASH_REDIS_REST_URL_REF') ?? 'UPSTASH_REDIS_REST_URL';
  const upstashTokenRef =
    getEnv(env, 'UPSTASH_REDIS_REST_TOKEN_REF') ?? 'UPSTASH_REDIS_REST_TOKEN';

  if (
    getEnv(env, 'UPSTASH_REDIS_REST_URL') ||
    getEnv(env, 'UPSTASH_REDIS_REST_TOKEN') ||
    getEnv(env, 'UPSTASH_REDIS_REST_URL_REF') ||
    getEnv(env, 'UPSTASH_REDIS_REST_TOKEN_REF')
  ) {
    setDeepValue(overrides, 'redis.enabled', true);
    setDeepValue(overrides, 'redis.defaultInstance', 'cache');
    setDeepValue(overrides, 'redis.instances.cache.connection.urlRef', upstashUrlRef);
    setDeepValue(overrides, 'redis.instances.cache.connection.passwordRef', upstashTokenRef);
    setDeepValue(overrides, 'redis.instances.cache.connection.rest.tokenRef', upstashTokenRef);
  }
}

function applyAuthOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const authSecretRef = getEnv(env, 'AUTH_SECRET_REF') ?? 'AUTH_SECRET';
  setDeepValue(overrides, 'auth.nextAuth.secretRef', authSecretRef);

  const providers = getEnvList(env, 'AUTH_PROVIDERS');

  if (providers.length > 0) {
    setDeepValue(overrides, 'auth.enabled', true);
    setDeepValue(overrides, 'auth.nextAuth.enabled', true);
    setDeepValue(overrides, 'auth.providers', providers);
  }

  if (getEnv(env, 'GOOGLE_CLIENT_ID') || getEnv(env, 'GOOGLE_CLIENT_SECRET_REF')) {
    setDeepValue(overrides, 'auth.google.enabled', true);
  }

  if (getEnv(env, 'GITHUB_CLIENT_ID') || getEnv(env, 'GITHUB_CLIENT_SECRET_REF')) {
    setDeepValue(overrides, 'auth.github.enabled', true);
  }

  if (getEnv(env, 'DISCORD_CLIENT_ID') || getEnv(env, 'DISCORD_CLIENT_SECRET_REF')) {
    setDeepValue(overrides, 'auth.discord.enabled', true);
  }
}

function applyDiscordOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (
    getEnv(env, 'DISCORD_APPLICATION_ID') ||
    getEnv(env, 'DISCORD_PUBLIC_KEY') ||
    getEnv(env, 'DISCORD_BOT_TOKEN_REF')
  ) {
    setDeepValue(overrides, 'discord.enabled', true);
    setDeepValue(overrides, 'discord.bot.enabled', true);
  }

  if (
    getEnv(env, 'DISCORD_INTERACTIONS_ENDPOINT_URL') ||
    getEnv(env, 'DISCORD_INTERACTIONS_ENDPOINT_PATH')
  ) {
    setDeepValue(overrides, 'discord.authMode', 'interactions-endpoint');
    setDeepValue(overrides, 'discord.runtimeMode', 'http-interactions');
    setDeepValue(overrides, 'discord.interactions.enabled', true);
  }
}

function applyGrafanaCloudOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (
    getEnv(env, 'NEXT_PUBLIC_FARO_URL') ||
    getEnv(env, 'PUBLIC_FARO_URL') ||
    getEnvBoolean(env, 'FARO_ENABLED') === true
  ) {
    setDeepValue(overrides, 'grafanaCloud.enabled', true);
    setDeepValue(overrides, 'grafanaCloud.addons.faro.enabled', true);
  }

  if (getEnv(env, 'GRAFANA_CLOUD_API_TOKEN_REF') || getEnv(env, 'GRAFANA_CLOUD_API_TOKEN')) {
    setDeepValue(overrides, 'grafanaCloud.enabled', true);
    setDeepValue(overrides, 'grafanaCloud.api.enabled', true);
    setDeepValue(
      overrides,
      'grafanaCloud.api.apiTokenRef',
      getEnv(env, 'GRAFANA_CLOUD_API_TOKEN_REF') ?? 'GRAFANA_CLOUD_API_TOKEN',
    );
  }
}

function applyStorageOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalString(env, overrides, 'STORAGE_PROVIDER', 'storage.provider');
  applyOptionalString(env, overrides, 'STORAGE_DEFAULT_BUCKET', 'storage.defaultBucket');
  applyOptionalString(env, overrides, 'STORAGE_S3_ENDPOINT', 'storage.s3.endpoint');
  applyOptionalString(env, overrides, 'STORAGE_S3_REGION', 'storage.s3.region');
  applyOptionalString(env, overrides, 'R2_ACCESS_KEY_ID_REF', 'storage.s3.accessKeyIdRef');
  applyOptionalString(env, overrides, 'R2_SECRET_ACCESS_KEY_REF', 'storage.s3.secretAccessKeyRef');
}

function applySecurityOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalString(env, overrides, 'UUID_NAMESPACE', 'security.uuidNamespace');
  applyOptionalString(env, overrides, 'UUID_NAMESPACE', 'security.uuid_namespace');
  applyOptionalString(env, overrides, 'SECURITY_DEFAULT_SENSITIVITY', 'security.defaultSensitivity');
  applyOptionalString(env, overrides, 'COOKIE_DOMAIN', 'security.cookies.domain');
  applyOptionalString(env, overrides, 'RATE_LIMIT_KEY_BY', 'security.rateLimit.keyBy');
  applyOptionalString(env, overrides, 'AUDIT_SIGNING_KEY_REF', 'security.audit.signingKeyRef');
  applyOptionalString(env, overrides, 'ENCRYPTION_PRIMARY_KEY_REF', 'security.encryption.primaryKeyRef');
}

function applyOptionalString(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(overrides, path, value);
  }
}

function applyOptionalBoolean(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(overrides, path, parseEnvBoolean(value));
  }
}

function applyOptionalNumber(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(overrides, path, Number(value));
  }
}

function applyOptionalInteger(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(overrides, path, parseEnvInteger(value));
  }
}

function applyOptionalList(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvList(env, envKey);

  if (value.length > 0) {
    setDeepValue(overrides, path, value);
  }
}

function assertEnvInput(
  env: EnvRecord,
  options: {
    name: string;
    allowEmpty: boolean;
  },
): void {
  if (!isPlainObject(env)) {
    throw new EnvConfigParseError(options.name, [
      {
        path: '<root>',
        pathSegments: [],
        message: 'Env input must be a plain object.',
        code: 'invalid_root',
      },
    ]);
  }

  if (!options.allowEmpty && Object.keys(env).length === 0) {
    throw new EnvConfigParseError(options.name, [
      {
        path: '<root>',
        pathSegments: [],
        message: 'Env input is required.',
        code: 'missing_input',
      },
    ]);
  }
}

function isPlainObject(value: unknown): value is EnvRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function createEnvConfigErrorMessage(
  configName: string,
  issues: readonly ValidationIssue[],
): string {
  if (issues.length === 0) {
    return `${configName} parsing failed.`;
  }

  return [
    `${configName} parsing failed:`,
    ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
  ].join('\n');
}
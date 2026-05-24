/* =============================================================================
 * @aerealith-ai/config
 * -----------------------------------------------------------------------------
 * Public barrel exports for the platform-neutral Helix AI config library.
 *
 * Keep this file explicit where duplicate symbol names exist across modules.
 * Avoid broad `export *` from schema/type files that intentionally share helper
 * names such as FaroConfig, faroSchema, or CloudflareServiceBindingConfig.
 * ============================================================================= */

/* =============================================================================
 * Primary config types
 * ============================================================================= */

export type { AppConfig } from './types/app';
export type { AuthConfig } from './types/auth';
export type { CloudflareConfig } from './types/cloudflare';
export type { DatabaseConfig } from './types/database';
export type { DiscordConfig } from './types/discord';
export type { GithubConfig } from './types/github';
export type { GrafanaCloudConfig } from './types/grafana-cloud';
export type { RedisConfig } from './types/redis';
export type { RoutesConfig } from './types/routes';
export type { SecurityConfig } from './types/security';
export type { ServicesConfig } from './types/services';
export type { StorageConfig } from './types/storage';
export type { TelemetryConfig } from './types/telemetry';

/* =============================================================================
 * Type conflict-safe aliases
 * ============================================================================= */

export type { CloudflareServiceBindingConfig } from './types/cloudflare';
export type {
  CloudflareServiceBindingConfig as ServiceCloudflareBindingConfig,
} from './types/services';

export type { FaroConfig } from './types/grafana-cloud';
export type { FaroConfig as TelemetryFaroConfig } from './types/telemetry';

/* =============================================================================
 * Route types
 * ============================================================================= */

export {
  ROUTE_AUTH_MODES,
  ROUTE_CACHE_MODES,
  ROUTE_EXPOSURES,
  ROUTE_HTTP_METHODS,
} from './types/routes';

export type {
  ApiRoutePath,
  RouteAuthMode,
  RouteCacheConfig,
  RouteCacheMode,
  RouteConfig,
  RouteCorsConfig,
  RouteExposure,
  RouteGroupConfig,
  RouteHttpMethod,
  RoutePath,
  RouteRateLimitConfig,
} from './types/routes';

/* =============================================================================
 * App schema
 * ============================================================================= */

export {
  appEnvironmentSchema,
  appIdentitySchema,
  appRuntimeSchema,
  appSchema,
  parseAppConfig,
  publicRuntimeSchema,
  publicTokensSchema,
  safeParseAppConfig,
} from './schema/app.schema';

export type {
  AppConfigInput,
  AppConfigOutput,
} from './schema/app.schema';

/* =============================================================================
 * Auth schema
 * ============================================================================= */

export {
  apiKeyAuthSchema,
  authCookieSchema,
  authProviderSchema,
  authRuntimeSchema,
  authSchema,
  authSessionStrategySchema,
  credentialsAuthSchema,
  magicLinkAuthSchema,
  nextAuthSchema,
  oauthProviderSchema,
  parseAuthConfig,
  passkeyAuthSchema,
  safeParseAuthConfig,
} from './schema/auth.schema';

export type {
  AuthConfigInput,
  AuthConfigOutput,
} from './schema/auth.schema';

/* =============================================================================
 * Cloudflare schema
 * ============================================================================= */

export {
  cloudflareAccountSchema,
  cloudflareAiBindingSchema,
  cloudflareAnalyticsEngineBindingSchema,
  cloudflareBindingKindSchema,
  cloudflareBindingsSchema,
  cloudflareBrowserRenderingBindingSchema,
  cloudflareCiSchema,
  cloudflareCustomDomainSchema,
  cloudflareD1DatabaseBindingSchema,
  cloudflareDispatchNamespaceBindingSchema,
  cloudflareDurableObjectBindingSchema,
  cloudflareDurableObjectStorageSchema,
  cloudflareEnvironmentConfigSchema,
  cloudflareEnvironmentSchema,
  cloudflareHyperdriveBindingSchema,
  cloudflareKvNamespaceBindingSchema,
  cloudflareLimitsSchema,
  cloudflarePlacementSchema,
  cloudflareQueueBindingSchema,
  cloudflareQueueRoleSchema,
  cloudflareR2BucketBindingSchema,
  cloudflareRouteModeSchema,
  cloudflareRouteSchema,
  cloudflareSchema,
  cloudflareSecretsSchema,
  cloudflareServiceBindingModeSchema,
  cloudflareServiceBindingSchema,
  cloudflareVarSchema,
  cloudflareVectorizeBindingSchema,
  cloudflareWorkflowBindingSchema,
  cloudflareWorkerRuntimeSchema,
  cloudflareWorkerSchema,
  parseCloudflareConfig,
  safeParseCloudflareConfig,
} from './schema/cloudflare.schema';

export type {
  CloudflareConfigInput,
  CloudflareConfigOutput,
} from './schema/cloudflare.schema';

/* =============================================================================
 * Database schema
 * ============================================================================= */

export {
  cloudflareD1DatabaseSchema,
  cloudflareHyperdriveDatabaseSchema,
  databaseConnectionModeSchema,
  databaseConnectionSchema,
  databaseInstanceSchema,
  databaseMigrationModeSchema,
  databaseMigrationSchema,
  databaseOrmSchema,
  databasePoolSchema,
  databaseProviderSchema,
  databaseReadReplicaSchema,
  databaseRuntimeSchema,
  databaseSchema,
  databaseSslModeSchema,
  databaseSslSchema,
  mikroOrmDatabaseSchema,
  parseDatabaseConfig,
  safeParseDatabaseConfig,
} from './schema/database.schema';

export type {
  DatabaseConfigInput,
  DatabaseConfigOutput,
} from './schema/database.schema';

/* =============================================================================
 * Discord schema
 * ============================================================================= */

export {
  discordAuthModeSchema,
  discordBotSchema,
  discordChannelPurposeSchema,
  discordCommandSchema,
  discordCommandScopeSchema,
  discordCommandTypeSchema,
  discordEventDeliverySchema,
  discordEventSchema,
  discordGatewayIntentSchema,
  discordGuildSchema,
  discordInteractionsSchema,
  discordModerationSchema,
  discordOAuth2Schema,
  discordRuntimeModeSchema,
  discordSchema,
  discordTicketsSchema,
  discordWebhookSchema,
  parseDiscordConfig,
  safeParseDiscordConfig,
} from './schema/discord.schema';

export type {
  DiscordConfigInput,
  DiscordConfigOutput,
} from './schema/discord.schema';

/* =============================================================================
 * GitHub schema
 * ============================================================================= */

export {
  githubApiSchema,
  githubAppSchema,
  githubAuthModeSchema,
  githubOAuthAppSchema,
  githubPermissionLevelSchema,
  githubRepositorySchema,
  githubRepositoryVisibilitySchema,
  githubSchema,
  parseGithubConfig,
  safeParseGithubConfig,
} from './schema/github.schema';

export type {
  GithubConfigInput,
  GithubConfigOutput,
} from './schema/github.schema';

/* =============================================================================
 * Grafana Cloud schema
 * ============================================================================= */

export {
  faroSchema,
  faroSessionTrackingSchema,
  faroTracingSchema,
  grafanaCloudAddonSchema,
  grafanaCloudApiSchema,
  grafanaCloudRegionSchema,
  grafanaCloudSchema,
  grafanaCloudSignalSchema,
  parseGrafanaCloudConfig,
  safeParseGrafanaCloudConfig,
} from './schema/grafana-cloud.schema';

export type {
  GrafanaCloudConfigInput,
  GrafanaCloudConfigOutput,
} from './schema/grafana-cloud.schema';

/* =============================================================================
 * Redis schema
 * ============================================================================= */

export {
  parseRedisConfig,
  redisCacheSchema,
  redisConnectionSchema,
  redisInstanceSchema,
  redisProviderSchema,
  redisRestSchema,
  redisRoleSchema,
  redisSchema,
  redisTlsSchema,
  redisTransportSchema,
  safeParseRedisConfig,
} from './schema/redis.schema';

export type {
  RedisConfigInput,
  RedisConfigOutput,
} from './schema/redis.schema';

/* =============================================================================
 * Routes schema
 * ============================================================================= */

export {
  apiRoutePathSchema,
  parseRoutesConfig,
  routeAuthModeSchema,
  routeCacheConfigSchema,
  routeCacheModeSchema,
  routeConfigSchema,
  routeCorsConfigSchema,
  routeExposureSchema,
  routeGroupConfigSchema,
  routeHttpMethodSchema,
  routePathSchema,
  routeRateLimitConfigSchema,
  routesSchema,
  safeParseRoutesConfig,
} from './schema/routes.schema';

export type {
  ApiRoutePathSchema,
  RouteAuthModeSchema,
  RouteCacheConfigSchema,
  RouteCacheModeSchema,
  RouteConfigSchema,
  RouteCorsConfigSchema,
  RouteExposureSchema,
  RouteGroupConfigSchema,
  RouteHttpMethodSchema,
  RoutePathSchema,
  RouteRateLimitConfigSchema,
  RoutesConfigInput,
  RoutesConfigOutput,
  RoutesConfigSchema,
} from './schema/routes.schema';

/* =============================================================================
 * Security schema
 * ============================================================================= */

export {
  auditSecuritySchema,
  contentSecurityPolicySchema,
  cookieSecuritySchema,
  corsSecuritySchema,
  encryptionSecuritySchema,
  hstsPreloadModeSchema,
  parseSecurityConfig,
  rateLimitSecuritySchema,
  referrerPolicySchema,
  safeParseSecurityConfig,
  sameSitePolicySchema,
  secretProviderSchema,
  secretRefSchema,
  securityEnvironmentSchema,
  securityHeadersSchema,
  securitySchema,
} from './schema/security.schema';

export type {
  SecurityConfigInput,
  SecurityConfigOutput,
} from './schema/security.schema';

/* =============================================================================
 * Services schema
 * ============================================================================= */

export {
  SERVICE_EXPOSURES,
  SERVICE_HEALTH_STATUSES,
  SERVICE_PROTOCOLS,
  SERVICE_RUNTIMES,
  cloudflareServiceBindingSchema as serviceCloudflareBindingSchema,
  parseServicesConfig,
  safeParseServicesConfig,
  serviceDependencySchema,
  serviceEndpointSchema,
  serviceExposureSchema,
  serviceHealthStatusSchema,
  serviceProtocolSchema,
  serviceQueueSchema,
  serviceRateLimitSchema,
  serviceRetrySchema,
  serviceRuntimeSchema,
  serviceSchema,
  servicesSchema,
} from './schema/services.schema';

export type {
  CloudflareServiceBindingSchema,
  ServiceDependencySchema,
  ServiceEndpointSchema,
  ServiceExposureSchema,
  ServiceHealthStatusSchema,
  ServiceProtocolSchema,
  ServiceQueueSchema,
  ServiceRateLimitSchema,
  ServiceRetrySchema,
  ServiceRuntimeSchema,
  ServiceSchema,
  ServicesConfigInput,
  ServicesConfigOutput,
} from './schema/services.schema';

/* =============================================================================
 * Storage schema
 * ============================================================================= */

export {
  localStorageSchema,
  parseStorageConfig,
  s3CompatibleStorageSchema,
  safeParseStorageConfig,
  storageAccessModeSchema,
  storageBucketSchema,
  storageObjectCategorySchema,
  storageProviderSchema,
  storageSchema,
} from './schema/storage.schema';

export type {
  StorageConfigInput,
  StorageConfigOutput,
} from './schema/storage.schema';

/* =============================================================================
 * Telemetry schema
 * ============================================================================= */

export {
  faroSchema as telemetryFaroSchema,
  openTelemetryLogLevelSchema,
  openTelemetryLogsExporterSchema,
  openTelemetryMetricsExporterSchema,
  openTelemetryProtocolSchema,
  openTelemetrySchema,
  openTelemetryTracesExporterSchema,
  parseTelemetryConfig,
  safeParseTelemetryConfig,
  telemetrySchema,
} from './schema/telemetry.schema';

export type {
  TelemetryConfigInput,
  TelemetryConfigOutput,
} from './schema/telemetry.schema';

/* =============================================================================
 * Default configs
 * ============================================================================= */

export * from './defaults/app.defaults';
export * from './defaults/auth.defaults';
export * from './defaults/cloudflare.defaults';
export * from './defaults/database.defaults';
export * from './defaults/discord.defaults';
export * from './defaults/github.defaults';
export * from './defaults/grafana-cloud.defaults';
export * from './defaults/redis.defaults';
export * from './defaults/routes.defaults';
export * from './defaults/security.defaults';
export * from './defaults/services.defaults';
export * from './defaults/storage.defaults';
export * from './defaults/telemetry.defaults';

/* =============================================================================
 * Runtime config factories
 * ============================================================================= */

export {
  appConfig,
  buildAppConfigOverrides,
  createAppConfig,
  resolveAppConfigDefaults,
  resolveAppConfigProfile,
} from './config/app.config';

export type {
  AppConfigOptions,
  AppConfigProfile,
  ResolvedAppConfigProfile,
} from './config/app.config';

export {
  authConfig,
  buildAuthConfigOverrides,
  createAuthConfig,
  resolveAuthConfigDefaults,
  resolveAuthConfigProfile,
} from './config/auth.config';

export type {
  AuthConfigOptions,
  AuthConfigProfile,
  ResolvedAuthConfigProfile,
} from './config/auth.config';

export {
  buildCloudflareConfigOverrides,
  cloudflareConfig,
  createCloudflareConfig,
  resolveCloudflareConfigDefaults,
  resolveCloudflareConfigProfile,
} from './config/cloudflare.config';

export type {
  CloudflareConfigOptions,
  CloudflareConfigProfile,
  ResolvedCloudflareConfigProfile,
} from './config/cloudflare.config';

export {
  buildDatabaseConfigOverrides,
  createDatabaseConfig,
  databaseConfig,
  resolveDatabaseConfigDefaults,
  resolveDatabaseConfigProfile,
} from './config/database.config';

export type {
  DatabaseConfigOptions,
  DatabaseConfigProfile,
  ResolvedDatabaseConfigProfile,
} from './config/database.config';

export {
  buildDiscordConfigOverrides,
  createDiscordConfig,
  discordConfig,
  resolveDiscordConfigDefaults,
  resolveDiscordConfigProfile,
} from './config/discord.config';

export type {
  DiscordConfigOptions,
  DiscordConfigProfile,
  ResolvedDiscordConfigProfile,
} from './config/discord.config';

export {
  buildGithubConfigOverrides,
  createGithubConfig,
  githubConfig,
  resolveGithubConfigDefaults,
  resolveGithubConfigProfile,
} from './config/github.config';

export type {
  GithubConfigOptions,
  GithubConfigProfile,
  ResolvedGithubConfigProfile,
} from './config/github.config';

export {
  buildGrafanaCloudConfigOverrides,
  createGrafanaCloudConfig,
  grafanaCloudConfig,
  resolveGrafanaCloudConfigDefaults,
  resolveGrafanaCloudConfigProfile,
} from './config/grafana-cloud.config';

export type {
  GrafanaCloudConfigOptions,
  GrafanaCloudConfigProfile,
  ResolvedGrafanaCloudConfigProfile,
} from './config/grafana-cloud.config';

export {
  buildRedisConfigOverrides,
  createRedisConfig,
  redisConfig,
  resolveRedisConfigDefaults,
  resolveRedisConfigProfile,
} from './config/redis.config';

export type {
  RedisConfigOptions,
  RedisConfigProfile,
  ResolvedRedisConfigProfile,
} from './config/redis.config';

export {
  buildRoutesConfigOverrides,
  createRoutesConfig,
  resolveRoutesConfigDefaults,
  resolveRoutesConfigProfile,
  routesConfig,
} from './config/routes.config';

export type {
  ResolvedRoutesConfigProfile,
  RoutesConfigOptions,
  RoutesConfigProfile,
} from './config/routes.config';

export {
  buildSecurityConfigOverrides,
  createSecurityConfig,
  fallbackSecurityUuidNamespace,
  resolveSecurityConfigDefaults,
  resolveSecurityConfigProfile,
  securityConfig,
} from './config/security.config';

export type {
  ResolvedSecurityConfigProfile,
  SecurityConfigOptions,
  SecurityConfigProfile,
} from './config/security.config';

export {
  buildServicesConfigOverrides,
  createServicesConfig,
  resolveServicesConfigDefaults,
  resolveServicesConfigProfile,
  servicesConfig,
} from './config/services.config';

export type {
  ResolvedServicesConfigProfile,
  ServicesConfigOptions,
  ServicesConfigProfile,
} from './config/services.config';

export {
  buildStorageConfigOverrides,
  createStorageConfig,
  resolveStorageConfigDefaults,
  resolveStorageConfigProfile,
  storageConfig,
} from './config/storage.config';

export type {
  ResolvedStorageConfigProfile,
  StorageConfigOptions,
  StorageConfigProfile,
} from './config/storage.config';

export {
  buildTelemetryConfigOverrides,
  createTelemetryConfig,
  telemetryConfig,
} from './config/telemetry.config';

export type {
  TelemetryConfigOptions,
} from './config/telemetry.config';

/* =============================================================================
 * Loaders
 * ============================================================================= */

export {
  EnvConfigParseError,
  buildEnvConfigOverrides,
  getKnownConfigEnvKeys,
  getUnknownPublicEnvKeys,
  loadConfigFromEnv,
  loadConfigFromEnvDetailed,
  resolveEnvConfigDefaults,
  resolveEnvConfigProfile,
  safeLoadConfigFromEnv,
  validateEnvConfig,
} from './loaders/from-env';

export type {
  EnvConfigProfile,
  LoadConfigFromEnvOptions,
  LoadConfigFromEnvResult,
  ResolvedEnvConfigProfile,
} from './loaders/from-env';

export {
  ObjectConfigParseError,
  createObjectConfigOverride,
  loadConfigFromObject,
  loadConfigFromObjectDetailed,
  mergeObjectConfig,
  normalizeObjectConfigInput,
  parseObjectConfig,
  resolveObjectConfigDefaults,
  safeLoadConfigFromObject,
  validateObjectConfig,
} from './loaders/from-object';

export type {
  LoadConfigFromObjectOptions,
  LoadConfigFromObjectResult,
  ObjectConfigProfile,
} from './loaders/from-object';

export {
  YamlConfigParseError,
  YamlConfigWarningError,
  loadConfigFromYaml,
  loadConfigFromYamlDetailed,
  mergeYamlConfig,
  parseYamlToObject,
  resolveYamlConfigDefaults,
} from './loaders/from-yaml';

export type {
  LoadConfigFromYamlOptions,
  LoadConfigFromYamlResult,
  YamlConfigProfile,
  YamlLoaderWarning,
} from './loaders/from-yaml';

/* =============================================================================
 * Validation utils
 * ============================================================================= */

export {
  ConfigValidationError,
  assertValidConfig,
  createValidationMessage,
  formatValidationPath,
  getValidationIssues,
  getValidationMessage,
  isValidationFailure,
  isValidationSuccess,
  isZodError,
  normalizeZodIssue,
  normalizeZodIssues,
  safeValidateConfig,
  throwIfInvalid,
  validateConfig,
  validateConfigOrDefault,
} from './utils/validation';

export type {
  ValidationFailure,
  ValidationIssue,
  ValidationOptions,
  ValidationPathSegment,
  ValidationResult,
  ValidationSuccess,
} from './utils/validation';

/* =============================================================================
 * Environment utils
 * ============================================================================= */

export {
  DEFAULT_FALSE_VALUES,
  DEFAULT_TRUE_VALUES,
  InvalidEnvVarError,
  MissingEnvVarError,
  assertEnvKeys,
  envToPlainRecord,
  filterEnvByPrefix,
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvJson,
  getEnvList,
  getEnvNumber,
  getEnvOneOf,
  getFirstEnv,
  getMissingEnvKeys,
  getPublicEnv,
  getRequiredEnv,
  getRequiredEnvBoolean,
  getRequiredEnvInteger,
  getRequiredEnvJson,
  getRequiredEnvNumber,
  getRequiredEnvOneOf,
  getRequiredFirstEnv,
  hasEnv,
  isCloudflareEnv,
  isPreviewEnv,
  isProductionEnv,
  isPublicEnvKey,
  mapEnvToObject,
  mergeEnvRecords,
  normalizeEnvValue,
  parseEnvBoolean,
  parseEnvInteger,
  parseEnvList,
  parseEnvNumber,
  pickEnv,
  requireEnvKeys,
  resolveAppEnvironment,
  setObjectPath,
  stripEnvPrefix,
} from './utils/env';

export type {
  EnvBooleanOptions,
  EnvJsonOptions,
  EnvListOptions,
  EnvNumberOptions,
  EnvPathMapping,
  EnvPrimitive,
  EnvRecord,
  EnvStringOptions,
} from './utils/env';

/* =============================================================================
 * Deep merge utils
 * ============================================================================= */

export {
  compactUndefined,
  deepClone,
  deepMerge,
  deepMergeAll,
  deleteDeepValue,
  getDeepValue,
  hasDeepValue,
  isMergeableValue,
  isPlainObject as isPlainConfigObject,
  mergeDefined,
  mergeOverwrite,
  setDeepValue,
} from './utils/deep-merge';

export type {
  ArrayMergeStrategy,
  DeepMergeOptions,
  DeepPartial,
  PlainObject,
  UndefinedMergeStrategy,
} from './utils/deep-merge';

/* =============================================================================
 * Redaction utils
 * ============================================================================= */

export {
  DEFAULT_REDACTION,
  DEFAULT_SENSITIVE_KEYS,
  DEFAULT_SENSITIVE_KEY_PATTERNS,
  DEFAULT_SENSITIVE_STRING_PATTERNS,
  getReplacement,
  isSensitiveKey,
  maskValue,
  redact,
  redactArray,
  redactEnv,
  redactObject,
  redactString,
  redactUrl,
} from './utils/redact';

export type {
  RedactOptions,
  RedactionContext,
  RedactionReplacement,
} from './utils/redact';
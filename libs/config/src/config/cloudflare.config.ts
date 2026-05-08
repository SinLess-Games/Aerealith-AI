import type { CloudflareConfig } from '../types/cloudflare';

import {
  defaultCloudflareConfig,
  defaultLocalCloudflareConfig,
  defaultProductionCloudflareConfig,
} from '../defaults/cloudflare.defaults';
import { cloudflareSchema } from '../schema/cloudflare.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvList,
  isCloudflareEnv,
  resolveAppEnvironment,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type CloudflareConfigProfile =
  | 'default'
  | 'local'
  | 'production'
  | 'auto';

export type ResolvedCloudflareConfigProfile = Exclude<
  CloudflareConfigProfile,
  'auto'
>;

export type CloudflareConfigOptions = {
  name?: string;
  profile?: CloudflareConfigProfile;
  defaults?: CloudflareConfig;
};

type KnownCloudflareEnvironment = {
  key: string;
  envPrefix: string;
};

type KnownServiceBinding = {
  key: string;
  envPrefix: string;
  defaultBinding: string;
  defaultService: string;
  defaultEntrypoint?: string;
};

type KnownQueueBinding = {
  key: string;
  envPrefix: string;
  defaultBinding: string;
  defaultQueueName: string;
};

type KnownR2Binding = {
  key: string;
  envPrefix: string;
  defaultBinding: string;
  defaultBucketName: string;
  defaultPurpose: string;
};

type KnownKvBinding = {
  key: string;
  envPrefix: string;
  defaultBinding: string;
  defaultPurpose: string;
};

type KnownD1Binding = {
  key: string;
  envPrefix: string;
  defaultBinding: string;
  defaultDatabaseName: string;
};

type KnownHyperdriveBinding = {
  key: string;
  envPrefix: string;
  defaultBinding: string;
  defaultPurpose: string;
};

type KnownVectorizeBinding = {
  key: string;
  envPrefix: string;
  defaultBinding: string;
  defaultIndexName: string;
  defaultDimensions: number;
  defaultPurpose: string;
};

type KnownDurableObjectBinding = {
  key: string;
  envPrefix: string;
  defaultBinding: string;
  defaultClassName: string;
  defaultPurpose: string;
};

type KnownWorkflowBinding = {
  key: string;
  envPrefix: string;
  defaultBinding: string;
  defaultName: string;
  defaultClassName: string;
  defaultPurpose: string;
};

const knownCloudflareEnvironments = [
  {
    key: 'development',
    envPrefix: 'CLOUDFLARE_DEV',
  },
  {
    key: 'preview',
    envPrefix: 'CLOUDFLARE_PREVIEW',
  },
  {
    key: 'production',
    envPrefix: 'CLOUDFLARE_PROD',
  },
] satisfies readonly KnownCloudflareEnvironment[];

const knownServiceBindings = [
  {
    key: 'API_GATEWAY_SERVICE',
    envPrefix: 'API_GATEWAY_SERVICE',
    defaultBinding: 'API_GATEWAY_SERVICE',
    defaultService: 'helix-api-gateway',
    defaultEntrypoint: 'ApiGatewayService',
  },
  {
    key: 'AUTH_SERVICE',
    envPrefix: 'AUTH_SERVICE',
    defaultBinding: 'AUTH_SERVICE',
    defaultService: 'helix-auth-service',
    defaultEntrypoint: 'AuthService',
  },
  {
    key: 'USER_SERVICE',
    envPrefix: 'USER_SERVICE',
    defaultBinding: 'USER_SERVICE',
    defaultService: 'helix-user-service',
    defaultEntrypoint: 'UserService',
  },
] satisfies readonly KnownServiceBinding[];

const knownQueueBindings = [
  {
    key: 'HELIX_EVENTS_QUEUE',
    envPrefix: 'HELIX_EVENTS_QUEUE',
    defaultBinding: 'HELIX_EVENTS_QUEUE',
    defaultQueueName: 'helix-events',
  },
] satisfies readonly KnownQueueBinding[];

const knownR2Bindings = [
  {
    key: 'HELIX_UPLOADS_BUCKET',
    envPrefix: 'HELIX_UPLOADS_BUCKET',
    defaultBinding: 'HELIX_UPLOADS_BUCKET',
    defaultBucketName: 'helix-prod-uploads',
    defaultPurpose: 'uploads',
  },
  {
    key: 'HELIX_EXPORTS_BUCKET',
    envPrefix: 'HELIX_EXPORTS_BUCKET',
    defaultBinding: 'HELIX_EXPORTS_BUCKET',
    defaultBucketName: 'helix-prod-exports',
    defaultPurpose: 'exports',
  },
  {
    key: 'HELIX_ARTIFACTS_BUCKET',
    envPrefix: 'HELIX_ARTIFACTS_BUCKET',
    defaultBinding: 'HELIX_ARTIFACTS_BUCKET',
    defaultBucketName: 'helix-prod-artifacts',
    defaultPurpose: 'artifacts',
  },
] satisfies readonly KnownR2Binding[];

const knownKvBindings = [
  {
    key: 'FEATURE_FLAGS',
    envPrefix: 'FEATURE_FLAGS',
    defaultBinding: 'FEATURE_FLAGS',
    defaultPurpose: 'feature-flags',
  },
] satisfies readonly KnownKvBinding[];

const knownD1Bindings = [
  {
    key: 'DB',
    envPrefix: 'D1',
    defaultBinding: 'DB',
    defaultDatabaseName: 'helix-prod-metadata',
  },
] satisfies readonly KnownD1Binding[];

const knownHyperdriveBindings = [
  {
    key: 'HYPERDRIVE',
    envPrefix: 'HYPERDRIVE',
    defaultBinding: 'HYPERDRIVE',
    defaultPurpose: 'primary-postgres',
  },
] satisfies readonly KnownHyperdriveBinding[];

const knownVectorizeBindings = [
  {
    key: 'MEMORY_INDEX',
    envPrefix: 'MEMORY_INDEX',
    defaultBinding: 'MEMORY_INDEX',
    defaultIndexName: 'helix-prod-memory',
    defaultDimensions: 1536,
    defaultPurpose: 'semantic-memory',
  },
] satisfies readonly KnownVectorizeBinding[];

const knownDurableObjectBindings = [
  {
    key: 'SESSION_OBJECT',
    envPrefix: 'SESSION_OBJECT',
    defaultBinding: 'SESSION_OBJECT',
    defaultClassName: 'SessionObject',
    defaultPurpose: 'websocket-sessions',
  },
] satisfies readonly KnownDurableObjectBinding[];

const knownWorkflowBindings = [
  {
    key: 'USER_ONBOARDING_WORKFLOW',
    envPrefix: 'USER_ONBOARDING_WORKFLOW',
    defaultBinding: 'USER_ONBOARDING_WORKFLOW',
    defaultName: 'user-onboarding',
    defaultClassName: 'UserOnboardingWorkflow',
    defaultPurpose: 'user-onboarding',
  },
] satisfies readonly KnownWorkflowBinding[];

export function createCloudflareConfig(
  env: EnvRecord = {},
  options: CloudflareConfigOptions = {},
): CloudflareConfig {
  const configName = options.name ?? 'cloudflare config';
  const profile = resolveCloudflareConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveCloudflareConfigDefaults(profile);
  const overrides = buildCloudflareConfigOverrides(env, profile);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(cloudflareSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data as CloudflareConfig;
}

export function buildCloudflareConfigOverrides(
  env: EnvRecord,
  profile: ResolvedCloudflareConfigProfile = resolveCloudflareConfigProfile(env),
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootOverrides(env, overrides);
  applyAccountOverrides(env, overrides);
  applyWorkerOverrides(env, overrides, profile);
  applyDefaultBindingOverrides(env, overrides);
  applyEnvironmentOverrides(env, overrides);
  applyCiOverrides(env, overrides);
  applyRequiredBindingKindsOverrides(env, overrides);
  applyMetadataOverrides(env, overrides);
  applyDerivedCloudflareOverrides(env, overrides, profile);

  return overrides;
}

export function resolveCloudflareConfigProfile(
  env: EnvRecord,
  profile: CloudflareConfigProfile = 'auto',
): ResolvedCloudflareConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const appRuntime = getEnv(env, 'APP_RUNTIME') ?? getEnv(env, 'HELIX_RUNTIME');

  if (appRuntime === 'cloudflare-worker') {
    return 'production';
  }

  const environment = resolveAppEnvironment(env);

  if (environment === 'production') {
    return 'production';
  }

  if (environment === 'development' || environment === 'test') {
    return 'local';
  }

  if (isCloudflareEnv(env) || hasCloudflareSignal(env)) {
    return 'production';
  }

  return 'default';
}

export function resolveCloudflareConfigDefaults(
  profile: ResolvedCloudflareConfigProfile,
): CloudflareConfig {
  if (profile === 'production') {
    return deepClone(defaultProductionCloudflareConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalCloudflareConfig);
  }

  return deepClone(defaultCloudflareConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createCloudflareConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const cloudflareConfig = createCloudflareConfig();

export default cloudflareConfig;

function applyRootOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'CLOUDFLARE_ENABLED', 'enabled');
  applyOptionalString(
    env,
    overrides,
    'CLOUDFLARE_DEFAULT_ENVIRONMENT',
    'defaultEnvironment',
  );
}

function applyAccountOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalString(env, overrides, 'CLOUDFLARE_ACCOUNT_ID', 'account.accountId');
  applyOptionalString(
    env,
    overrides,
    'CLOUDFLARE_API_TOKEN_REF',
    'account.apiTokenRef',
  );
  applyOptionalString(env, overrides, 'CLOUDFLARE_ZONE_ID', 'account.zoneId');
  applyOptionalString(env, overrides, 'CLOUDFLARE_ZONE_NAME', 'account.zoneName');

  const domain =
    getEnv(env, 'PRIMARY_DOMAIN') ??
    getEnv(env, 'APP_DOMAIN') ??
    getEnv(env, 'CLOUDFLARE_ZONE_NAME');

  if (domain !== undefined) {
    setDeepValue(overrides, 'account.zoneName', domain);
  }
}

function applyWorkerOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  profile: ResolvedCloudflareConfigProfile,
): void {
  const environment = resolveAppEnvironment(env);

  const runtime =
    getEnv(env, 'CLOUDFLARE_WORKER_RUNTIME') ??
    getEnv(env, 'WORKER_RUNTIME') ??
    getEnv(env, 'APP_RUNTIME') ??
    getEnv(env, 'HELIX_RUNTIME') ??
    (profile === 'local' ? 'nodejs' : 'cloudflare-worker');

  const workerName =
    getEnv(env, 'CLOUDFLARE_WORKER_NAME') ??
    getEnv(env, 'WORKER_NAME') ??
    (environment === 'production' ? 'helix-frontend' : 'helix-frontend-dev');

  setDeepValue(overrides, 'worker.runtime', runtime);
  setDeepValue(overrides, 'worker.name', workerName);

  applyOptionalString(env, overrides, 'CLOUDFLARE_WORKER_MAIN', 'worker.main');
  applyOptionalString(env, overrides, 'WORKER_MAIN', 'worker.main');
  applyOptionalString(
    env,
    overrides,
    'CLOUDFLARE_COMPATIBILITY_DATE',
    'worker.compatibilityDate',
  );
  applyOptionalList(
    env,
    overrides,
    'CLOUDFLARE_COMPATIBILITY_FLAGS',
    'worker.compatibilityFlags',
  );
  applyOptionalBoolean(env, overrides, 'CLOUDFLARE_WORKERS_DEV', 'worker.workersDev');

  applyRoutesOverrides(env, overrides, 'worker.routes');
  applyCustomDomainsOverrides(env, overrides, 'worker.customDomains');

  applyOptionalBoolean(
    env,
    overrides,
    'CLOUDFLARE_PLACEMENT_ENABLED',
    'worker.placement.enabled',
  );
  applyOptionalString(
    env,
    overrides,
    'CLOUDFLARE_PLACEMENT_MODE',
    'worker.placement.mode',
  );

  applyOptionalInteger(
    env,
    overrides,
    'CLOUDFLARE_MAX_REQUEST_BODY_BYTES',
    'worker.limits.maxRequestBodyBytes',
  );
  applyOptionalInteger(
    env,
    overrides,
    'CLOUDFLARE_REQUEST_TIMEOUT_MS',
    'worker.limits.requestTimeoutMs',
  );
  applyOptionalInteger(
    env,
    overrides,
    'CLOUDFLARE_CPU_BUDGET_MS',
    'worker.limits.cpuBudgetMs',
  );

  applyOptionalList(env, overrides, 'CLOUDFLARE_WORKER_TAGS', 'worker.tags');

  applyOptionalString(env, overrides, 'APP_NAME', 'worker.metadata.app');
  applyOptionalString(env, overrides, 'APP_OWNER', 'worker.metadata.owner');
  applyOptionalString(env, overrides, 'APP_DOMAIN', 'worker.metadata.domain');
}

function applyDefaultBindingOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyVarsOverrides(env, overrides, 'worker.bindings.vars.values');
  applySecretsOverrides(env, overrides, 'worker.bindings.secrets');

  applyKvOverrides(env, overrides, 'worker.bindings.kvNamespaces');
  applyR2Overrides(env, overrides, 'worker.bindings.r2Buckets');
  applyQueueOverrides(env, overrides, 'worker.bindings.queues');
  applyDurableObjectOverrides(env, overrides, 'worker.bindings.durableObjects');
  applyD1Overrides(env, overrides, 'worker.bindings.d1Databases');
  applyHyperdriveOverrides(env, overrides, 'worker.bindings.hyperdrive');
  applyVectorizeOverrides(env, overrides, 'worker.bindings.vectorize');
  applyServiceOverrides(env, overrides, 'worker.bindings.services');
  applyWorkflowOverrides(env, overrides, 'worker.bindings.workflows');

  applyOptionalString(env, overrides, 'CLOUDFLARE_AI_BINDING', 'worker.bindings.ai.binding');
  applyOptionalBoolean(env, overrides, 'CLOUDFLARE_AI_ENABLED', 'worker.bindings.ai.enabled');
  applyOptionalString(
    env,
    overrides,
    'CLOUDFLARE_AI_DEFAULT_MODEL',
    'worker.bindings.ai.defaultModel',
  );

  applyOptionalString(
    env,
    overrides,
    'CLOUDFLARE_BROWSER_BINDING',
    'worker.bindings.browserRendering.binding',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'CLOUDFLARE_BROWSER_ENABLED',
    'worker.bindings.browserRendering.enabled',
  );
}

function applyEnvironmentOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  for (const environment of knownCloudflareEnvironments) {
    applySingleEnvironmentOverrides(env, overrides, environment);
  }
}

function applySingleEnvironmentOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  environment: KnownCloudflareEnvironment,
): void {
  const basePath = `environments.${environment.key}`;
  const prefix = environment.envPrefix;

  applyOptionalString(env, overrides, `${prefix}_NAME`, `${basePath}.name`);
  applyOptionalString(
    env,
    overrides,
    `${prefix}_WORKER_NAME`,
    `${basePath}.workerName`,
  );

  applyRoutesOverrides(env, overrides, `${basePath}.routes`, prefix);
  applyCustomDomainsOverrides(env, overrides, `${basePath}.customDomains`, prefix);

  applyVarsOverrides(env, overrides, `${basePath}.bindings.vars.values`, prefix);
  applySecretsOverrides(env, overrides, `${basePath}.bindings.secrets`, prefix);

  applyKvOverrides(env, overrides, `${basePath}.bindings.kvNamespaces`, prefix);
  applyR2Overrides(env, overrides, `${basePath}.bindings.r2Buckets`, prefix);
  applyQueueOverrides(env, overrides, `${basePath}.bindings.queues`, prefix);
  applyDurableObjectOverrides(
    env,
    overrides,
    `${basePath}.bindings.durableObjects`,
    prefix,
  );
  applyD1Overrides(env, overrides, `${basePath}.bindings.d1Databases`, prefix);
  applyHyperdriveOverrides(
    env,
    overrides,
    `${basePath}.bindings.hyperdrive`,
    prefix,
  );
  applyVectorizeOverrides(env, overrides, `${basePath}.bindings.vectorize`, prefix);
  applyServiceOverrides(env, overrides, `${basePath}.bindings.services`, prefix);
  applyWorkflowOverrides(env, overrides, `${basePath}.bindings.workflows`, prefix);

  applyOptionalString(
    env,
    overrides,
    `${prefix}_AI_BINDING`,
    `${basePath}.bindings.ai.binding`,
  );
  applyOptionalBoolean(
    env,
    overrides,
    `${prefix}_AI_ENABLED`,
    `${basePath}.bindings.ai.enabled`,
  );
  applyOptionalString(
    env,
    overrides,
    `${prefix}_AI_DEFAULT_MODEL`,
    `${basePath}.bindings.ai.defaultModel`,
  );

  applyOptionalString(
    env,
    overrides,
    `${prefix}_BROWSER_BINDING`,
    `${basePath}.bindings.browserRendering.binding`,
  );
  applyOptionalBoolean(
    env,
    overrides,
    `${prefix}_BROWSER_ENABLED`,
    `${basePath}.bindings.browserRendering.enabled`,
  );

  applyOptionalString(
    env,
    overrides,
    `${prefix}_COMPATIBILITY_DATE`,
    `${basePath}.compatibilityDate`,
  );
  applyOptionalList(
    env,
    overrides,
    `${prefix}_COMPATIBILITY_FLAGS`,
    `${basePath}.compatibilityFlags`,
  );
  applyOptionalBoolean(env, overrides, `${prefix}_DEPLOYABLE`, `${basePath}.deployable`);
  applyOptionalBoolean(
    env,
    overrides,
    `${prefix}_REQUIRES_APPROVAL`,
    `${basePath}.requiresApproval`,
  );
}

function applyRoutesOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  const routePatterns = getEnvList(env, `${prefix}_ROUTES`);

  if (routePatterns.length === 0) {
    return;
  }

  const zoneName =
    getEnv(env, `${prefix}_ZONE_NAME`) ??
    getEnv(env, 'CLOUDFLARE_ZONE_NAME') ??
    getEnv(env, 'APP_DOMAIN') ??
    getEnv(env, 'PRIMARY_DOMAIN');

  const zoneId = getEnv(env, `${prefix}_ZONE_ID`) ?? getEnv(env, 'CLOUDFLARE_ZONE_ID');

  const routes = routePatterns.map((pattern) => ({
    pattern,
    zoneName,
    zoneId,
    mode: getEnv(env, `${prefix}_ROUTE_MODE`) ?? 'custom-domain',
    enabled: getEnvBoolean(env, `${prefix}_ROUTES_ENABLED`) ?? true,
  }));

  setDeepValue(overrides, path, routes);
}

function applyCustomDomainsOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  const hostnames = getEnvList(env, `${prefix}_CUSTOM_DOMAINS`);

  if (hostnames.length === 0) {
    return;
  }

  const zoneName =
    getEnv(env, `${prefix}_ZONE_NAME`) ??
    getEnv(env, 'CLOUDFLARE_ZONE_NAME') ??
    getEnv(env, 'APP_DOMAIN') ??
    getEnv(env, 'PRIMARY_DOMAIN');

  const zoneId = getEnv(env, `${prefix}_ZONE_ID`) ?? getEnv(env, 'CLOUDFLARE_ZONE_ID');

  const customDomains = hostnames.map((hostname) => ({
    hostname,
    zoneName,
    zoneId,
    enabled: getEnvBoolean(env, `${prefix}_CUSTOM_DOMAINS_ENABLED`) ?? true,
  }));

  setDeepValue(overrides, path, customDomains);
}

function applyVarsOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  const appName = getEnv(env, 'APP_NAME') ?? getEnv(env, 'NEXT_PUBLIC_APP_NAME');
  const appEnv = getEnv(env, 'APP_ENV') ?? getEnv(env, 'NODE_ENV');
  const appUrl =
    getEnv(env, 'APP_URL') ??
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL');
  const domain =
    getEnv(env, 'PRIMARY_DOMAIN') ??
    getEnv(env, 'APP_DOMAIN') ??
    getEnv(env, 'CLOUDFLARE_ZONE_NAME');

  if (appName !== undefined) {
    setDeepValue(overrides, `${path}.APP_NAME`, appName);
  }

  if (appEnv !== undefined) {
    setDeepValue(overrides, `${path}.APP_ENV`, appEnv);
  }

  if (appUrl !== undefined) {
    setDeepValue(overrides, `${path}.APP_URL`, appUrl);
    setDeepValue(overrides, `${path}.PUBLIC_APP_URL`, appUrl);
  }

  if (domain !== undefined) {
    setDeepValue(overrides, `${path}.PRIMARY_DOMAIN`, domain);
  }

  const vars = getEnvList(env, `${prefix}_VARS`);

  for (const varName of vars) {
    const value = getEnv(env, varName);

    if (value !== undefined) {
      setDeepValue(overrides, `${path}.${varName}`, value);
    }
  }
}

function applySecretsOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  const required = getEnvList(env, `${prefix}_REQUIRED_SECRETS`);
  const optional = getEnvList(env, `${prefix}_OPTIONAL_SECRETS`);
  const localFile = getEnv(env, `${prefix}_LOCAL_SECRETS_FILE`);

  if (required.length > 0) {
    setDeepValue(overrides, `${path}.required`, required);
  }

  if (optional.length > 0) {
    setDeepValue(overrides, `${path}.optional`, optional);
  }

  if (localFile !== undefined) {
    setDeepValue(overrides, `${path}.localFile`, localFile);
  }
}

function applyKvOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  for (const binding of knownKvBindings) {
    const envPrefix = `${prefix}_${binding.envPrefix}`;
    const id = getEnv(env, `${envPrefix}_ID`);
    const previewId = getEnv(env, `${envPrefix}_PREVIEW_ID`);
    const bindingName = getEnv(env, `${envPrefix}_BINDING`);

    if (id === undefined && previewId === undefined && bindingName === undefined) {
      continue;
    }

    setDeepValue(overrides, `${path}.${binding.key}`, {
      binding: bindingName ?? binding.defaultBinding,
      id,
      previewId,
      purpose: getEnv(env, `${envPrefix}_PURPOSE`) ?? binding.defaultPurpose,
    });
  }
}

function applyR2Overrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  for (const binding of knownR2Bindings) {
    const envPrefix = `${prefix}_${binding.envPrefix}`;
    const bucketName = getEnv(env, `${envPrefix}_BUCKET_NAME`);
    const previewBucketName = getEnv(env, `${envPrefix}_PREVIEW_BUCKET_NAME`);
    const bindingName = getEnv(env, `${envPrefix}_BINDING`);
    const publicUrl = getEnv(env, `${envPrefix}_PUBLIC_URL`);
    const purpose = getEnv(env, `${envPrefix}_PURPOSE`);

    if (
      bucketName === undefined &&
      previewBucketName === undefined &&
      bindingName === undefined &&
      publicUrl === undefined &&
      purpose === undefined
    ) {
      continue;
    }

    setDeepValue(overrides, `${path}.${binding.key}`, {
      binding: bindingName ?? binding.defaultBinding,
      bucketName: bucketName ?? binding.defaultBucketName,
      previewBucketName,
      publicUrl,
      purpose: purpose ?? binding.defaultPurpose,
    });
  }
}

function applyQueueOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  for (const binding of knownQueueBindings) {
    const envPrefix = `${prefix}_${binding.envPrefix}`;
    const queueName = getEnv(env, `${envPrefix}_QUEUE_NAME`);
    const bindingName = getEnv(env, `${envPrefix}_BINDING`);
    const role = getEnv(env, `${envPrefix}_ROLE`);
    const eventTypes = getEnvList(env, `${envPrefix}_EVENT_TYPES`);
    const deadLetterQueueName = getEnv(env, `${envPrefix}_DLQ`);
    const maxBatchSize = getEnvInteger(env, `${envPrefix}_MAX_BATCH_SIZE`);
    const maxBatchTimeoutSeconds = getEnvInteger(
      env,
      `${envPrefix}_MAX_BATCH_TIMEOUT_SECONDS`,
    );
    const maxRetries = getEnvInteger(env, `${envPrefix}_MAX_RETRIES`);

    if (
      queueName === undefined &&
      bindingName === undefined &&
      role === undefined &&
      eventTypes.length === 0 &&
      deadLetterQueueName === undefined &&
      maxBatchSize === undefined &&
      maxBatchTimeoutSeconds === undefined &&
      maxRetries === undefined
    ) {
      continue;
    }

    setDeepValue(overrides, `${path}.${binding.key}`, {
      binding: bindingName ?? binding.defaultBinding,
      queueName: queueName ?? binding.defaultQueueName,
      role: role ?? 'producer-consumer',
      eventTypes,
      deadLetterQueueName,
      maxBatchSize,
      maxBatchTimeoutSeconds,
      maxRetries,
    });
  }
}

function applyDurableObjectOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  for (const binding of knownDurableObjectBindings) {
    const envPrefix = `${prefix}_${binding.envPrefix}`;
    const bindingName = getEnv(env, `${envPrefix}_BINDING`);
    const className = getEnv(env, `${envPrefix}_CLASS_NAME`);
    const scriptName = getEnv(env, `${envPrefix}_SCRIPT_NAME`);
    const storage = getEnv(env, `${envPrefix}_STORAGE`);
    const purpose = getEnv(env, `${envPrefix}_PURPOSE`);

    if (
      bindingName === undefined &&
      className === undefined &&
      scriptName === undefined &&
      storage === undefined &&
      purpose === undefined
    ) {
      continue;
    }

    setDeepValue(overrides, `${path}.${binding.key}`, {
      binding: bindingName ?? binding.defaultBinding,
      className: className ?? binding.defaultClassName,
      scriptName,
      storage: storage ?? 'sqlite',
      purpose: purpose ?? binding.defaultPurpose,
    });
  }
}

function applyD1Overrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  for (const binding of knownD1Bindings) {
    const envPrefix = `${prefix}_${binding.envPrefix}`;
    const bindingName = getEnv(env, `${envPrefix}_BINDING`);
    const databaseName = getEnv(env, `${envPrefix}_DATABASE_NAME`);
    const databaseId = getEnv(env, `${envPrefix}_DATABASE_ID`);
    const previewDatabaseId = getEnv(env, `${envPrefix}_PREVIEW_DATABASE_ID`);
    const secondaryOnly = getEnvBoolean(env, `${envPrefix}_SECONDARY_ONLY`);

    if (
      bindingName === undefined &&
      databaseName === undefined &&
      databaseId === undefined &&
      previewDatabaseId === undefined &&
      secondaryOnly === undefined
    ) {
      continue;
    }

    setDeepValue(overrides, `${path}.${binding.key}`, {
      binding: bindingName ?? binding.defaultBinding,
      databaseName: databaseName ?? binding.defaultDatabaseName,
      databaseId,
      previewDatabaseId,
      secondaryOnly: secondaryOnly ?? true,
    });
  }
}

function applyHyperdriveOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  for (const binding of knownHyperdriveBindings) {
    const envPrefix = `${prefix}_${binding.envPrefix}`;
    const bindingName = getEnv(env, `${envPrefix}_BINDING`);
    const id = getEnv(env, `${envPrefix}_ID`);
    const originDatabaseUrlRef = getEnv(env, `${envPrefix}_ORIGIN_DATABASE_URL_REF`);
    const purpose = getEnv(env, `${envPrefix}_PURPOSE`);

    if (
      bindingName === undefined &&
      id === undefined &&
      originDatabaseUrlRef === undefined &&
      purpose === undefined
    ) {
      continue;
    }

    setDeepValue(overrides, `${path}.${binding.key}`, {
      binding: bindingName ?? binding.defaultBinding,
      id,
      originDatabaseUrlRef: originDatabaseUrlRef ?? 'DATABASE_URL',
      purpose: purpose ?? binding.defaultPurpose,
    });
  }
}

function applyVectorizeOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  for (const binding of knownVectorizeBindings) {
    const envPrefix = `${prefix}_${binding.envPrefix}`;
    const bindingName = getEnv(env, `${envPrefix}_BINDING`);
    const indexName = getEnv(env, `${envPrefix}_INDEX_NAME`);
    const indexId = getEnv(env, `${envPrefix}_INDEX_ID`);
    const dimensions = getEnvInteger(env, `${envPrefix}_DIMENSIONS`);
    const purpose = getEnv(env, `${envPrefix}_PURPOSE`);

    if (
      bindingName === undefined &&
      indexName === undefined &&
      indexId === undefined &&
      dimensions === undefined &&
      purpose === undefined
    ) {
      continue;
    }

    setDeepValue(overrides, `${path}.${binding.key}`, {
      binding: bindingName ?? binding.defaultBinding,
      indexName: indexName ?? binding.defaultIndexName,
      indexId,
      dimensions: dimensions ?? binding.defaultDimensions,
      purpose: purpose ?? binding.defaultPurpose,
    });
  }
}

function applyServiceOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  for (const binding of knownServiceBindings) {
    const envPrefix = `${prefix}_${binding.envPrefix}`;
    const bindingName = getEnv(env, `${envPrefix}_BINDING`);
    const service = getEnv(env, `${envPrefix}_SERVICE`);
    const entrypoint = getEnv(env, `${envPrefix}_ENTRYPOINT`);
    const mode = getEnv(env, `${envPrefix}_MODE`);
    const purpose = getEnv(env, `${envPrefix}_PURPOSE`);

    if (
      bindingName === undefined &&
      service === undefined &&
      entrypoint === undefined &&
      mode === undefined &&
      purpose === undefined
    ) {
      continue;
    }

    setDeepValue(overrides, `${path}.${binding.key}`, {
      binding: bindingName ?? binding.defaultBinding,
      service: service ?? binding.defaultService,
      entrypoint: entrypoint ?? binding.defaultEntrypoint,
      mode: mode ?? 'rpc',
      purpose:
        purpose ??
        binding.defaultService.replace(/^helix-/, 'internal-').replace(/-/g, '_'),
    });
  }
}

function applyWorkflowOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  path: string,
  prefix = 'CLOUDFLARE',
): void {
  for (const binding of knownWorkflowBindings) {
    const envPrefix = `${prefix}_${binding.envPrefix}`;
    const bindingName = getEnv(env, `${envPrefix}_BINDING`);
    const name = getEnv(env, `${envPrefix}_NAME`);
    const className = getEnv(env, `${envPrefix}_CLASS_NAME`);
    const purpose = getEnv(env, `${envPrefix}_PURPOSE`);

    if (
      bindingName === undefined &&
      name === undefined &&
      className === undefined &&
      purpose === undefined
    ) {
      continue;
    }

    setDeepValue(overrides, `${path}.${binding.key}`, {
      binding: bindingName ?? binding.defaultBinding,
      name: name ?? binding.defaultName,
      className: className ?? binding.defaultClassName,
      purpose: purpose ?? binding.defaultPurpose,
    });
  }
}

function applyCiOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'CLOUDFLARE_CI_ENABLED', 'ci.enabled');
  applyOptionalString(env, overrides, 'CLOUDFLARE_CI_PROVIDER', 'ci.provider');
  applyOptionalString(
    env,
    overrides,
    'CLOUDFLARE_ACCOUNT_ID_REF',
    'ci.accountIdRef',
  );
  applyOptionalString(env, overrides, 'CLOUDFLARE_API_TOKEN_REF', 'ci.apiTokenRef');
  applyOptionalBoolean(
    env,
    overrides,
    'CLOUDFLARE_PRODUCTION_APPROVAL_REQUIRED',
    'ci.productionApprovalRequired',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'CLOUDFLARE_GRADUAL_DEPLOYMENTS_ENABLED',
    'ci.gradualDeploymentsEnabled',
  );
}

function applyRequiredBindingKindsOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalList(
    env,
    overrides,
    'CLOUDFLARE_REQUIRED_BINDING_KINDS',
    'requiredBindingKinds',
  );
}

function applyMetadataOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalString(env, overrides, 'APP_NAME', 'metadata.app');
  applyOptionalString(env, overrides, 'APP_OWNER', 'metadata.owner');
  applyOptionalString(env, overrides, 'APP_DOMAIN', 'metadata.domain');
  applyOptionalString(env, overrides, 'MONOREPO_TOOL', 'metadata.monorepo');
  applyOptionalString(env, overrides, 'FRONTEND_FRAMEWORK', 'metadata.frontend');
}

function applyDerivedCloudflareOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  profile: ResolvedCloudflareConfigProfile,
): void {
  const environment = resolveAppEnvironment(env);
  const domain =
    getEnv(env, 'PRIMARY_DOMAIN') ??
    getEnv(env, 'APP_DOMAIN') ??
    getEnv(env, 'CLOUDFLARE_ZONE_NAME') ??
    'helixaibot.com';

  const appUrl =
    getEnv(env, 'APP_URL') ??
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL') ??
    (environment === 'production'
      ? `https://${domain}`
      : 'http://localhost:3000');

  const workerRuntime =
    getEnv(env, 'CLOUDFLARE_WORKER_RUNTIME') ??
    getEnv(env, 'WORKER_RUNTIME') ??
    getEnv(env, 'APP_RUNTIME') ??
    getEnv(env, 'HELIX_RUNTIME') ??
    (profile === 'local' ? 'nodejs' : 'cloudflare-worker');

  setDeepValue(overrides, 'worker.runtime', workerRuntime);

  if (isCloudflareEnv(env) || hasCloudflareSignal(env)) {
    setDeepValue(overrides, 'enabled', true);
  }

  setDeepValue(overrides, 'defaultEnvironment', environment);

  if (domain !== undefined) {
    setDeepValue(overrides, 'account.zoneName', domain);
    setDeepValue(overrides, 'worker.metadata.domain', domain);
    setDeepValue(overrides, 'metadata.domain', domain);
  }

  if (appUrl !== undefined) {
    setDeepValue(overrides, 'worker.bindings.vars.values.APP_URL', appUrl);
    setDeepValue(overrides, 'worker.bindings.vars.values.PUBLIC_APP_URL', appUrl);
  }

  setDeepValue(overrides, 'worker.bindings.vars.values.PRIMARY_DOMAIN', domain);
  setDeepValue(overrides, 'worker.bindings.vars.values.APP_ENV', environment);

  if (environment === 'production') {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'worker.workersDev', false);
    setDeepValue(
      overrides,
      'worker.name',
      getEnv(env, 'CLOUDFLARE_WORKER_NAME') ?? 'helix-frontend',
    );

    if (getEnv(env, 'CLOUDFLARE_ROUTES') === undefined) {
      setDeepValue(overrides, 'environments.production.routes', [
        {
          pattern: domain,
          zoneName: domain,
          zoneId: getEnv(env, 'CLOUDFLARE_ZONE_ID'),
          mode: 'custom-domain',
          enabled: true,
        },
      ]);
    }

    if (getEnv(env, 'CLOUDFLARE_CUSTOM_DOMAINS') === undefined) {
      setDeepValue(overrides, 'environments.production.customDomains', [
        {
          hostname: domain,
          zoneName: domain,
          zoneId: getEnv(env, 'CLOUDFLARE_ZONE_ID'),
          enabled: true,
        },
      ]);
    }

    setDeepValue(overrides, 'ci.productionApprovalRequired', true);
  }

  if (environment === 'development') {
    setDeepValue(
      overrides,
      'worker.name',
      getEnv(env, 'CLOUDFLARE_WORKER_NAME') ?? 'helix-frontend-dev',
    );
  }

  if (
    getEnv(env, 'HYPERDRIVE_BINDING') !== undefined ||
    getEnv(env, 'DATABASE_PROVIDER') === 'cloudflare-hyperdrive'
  ) {
    setDeepValue(
      overrides,
      'worker.compatibilityFlags',
      mergeUniqueStrings(
        getEnvList(env, 'CLOUDFLARE_COMPATIBILITY_FLAGS'),
        ['nodejs_compat'],
      ),
    );
  }

  setDeepValue(
    overrides,
    'ci.accountIdRef',
    getEnv(env, 'CLOUDFLARE_ACCOUNT_ID_REF') ?? 'CLOUDFLARE_ACCOUNT_ID',
  );
  setDeepValue(
    overrides,
    'ci.apiTokenRef',
    getEnv(env, 'CLOUDFLARE_API_TOKEN_REF') ?? 'CLOUDFLARE_API_TOKEN',
  );
}

function hasCloudflareSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'CLOUDFLARE_ACCOUNT_ID') ||
      getEnv(env, 'CLOUDFLARE_API_TOKEN') ||
      getEnv(env, 'CLOUDFLARE_API_TOKEN_REF') ||
      getEnv(env, 'CLOUDFLARE_ZONE_ID') ||
      getEnv(env, 'CLOUDFLARE_ZONE_NAME') ||
      getEnv(env, 'CLOUDFLARE_WORKER_NAME') ||
      getEnv(env, 'CLOUDFLARE_ROUTES') ||
      getEnv(env, 'CLOUDFLARE_CUSTOM_DOMAINS') ||
      getEnv(env, 'CLOUDFLARE_COMPATIBILITY_DATE') ||
      getEnv(env, 'CF_PAGES') ||
      getEnv(env, 'CF_PAGES_BRANCH') ||
      getEnv(env, 'CF_PAGES_COMMIT_SHA'),
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

function mergeUniqueStrings(
  currentValues: readonly string[],
  extraValues: readonly string[],
): string[] {
  return [...new Set([...currentValues, ...extraValues])];
}
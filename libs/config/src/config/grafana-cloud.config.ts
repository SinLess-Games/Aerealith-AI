import type { GrafanaCloudConfig } from '../types/grafana-cloud';

import {
  defaultGrafanaCloudConfig,
  defaultProductionGrafanaCloudConfig,
} from '../defaults/grafana-cloud.defaults';
import { grafanaCloudSchema } from '../schema/grafana-cloud.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvList,
  getEnvNumber,
  resolveAppEnvironment,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type GrafanaCloudConfigProfile =
  | 'default'
  | 'local'
  | 'production'
  | 'auto';

export type ResolvedGrafanaCloudConfigProfile = Exclude<
  GrafanaCloudConfigProfile,
  'auto'
>;

export type GrafanaCloudConfigOptions = {
  name?: string;
  profile?: GrafanaCloudConfigProfile;
  defaults?: GrafanaCloudConfig;
};

export function createGrafanaCloudConfig(
  env: EnvRecord = {},
  options: GrafanaCloudConfigOptions = {},
): GrafanaCloudConfig {
  const configName = options.name ?? 'grafana cloud config';
  const profile = resolveGrafanaCloudConfigProfile(
    env,
    options.profile ?? 'auto',
  );
  const defaults = options.defaults ?? resolveGrafanaCloudConfigDefaults(profile);
  const overrides = buildGrafanaCloudConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(grafanaCloudSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function buildGrafanaCloudConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootGrafanaCloudOverrides(env, overrides);
  applyApiOverrides(env, overrides);
  applyFaroOverrides(env, overrides);
  applyEnabledSignalsOverrides(env, overrides);
  applyDerivedGrafanaCloudOverrides(env, overrides);

  return overrides;
}

export function resolveGrafanaCloudConfigProfile(
  env: EnvRecord,
  profile: GrafanaCloudConfigProfile = 'auto',
): ResolvedGrafanaCloudConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const environment = resolveAppEnvironment(env);

  if (environment === 'production') {
    return 'production';
  }

  if (environment === 'development' || environment === 'test') {
    return 'local';
  }

  return 'default';
}

export function resolveGrafanaCloudConfigDefaults(
  profile: ResolvedGrafanaCloudConfigProfile,
): GrafanaCloudConfig {
  if (profile === 'production') {
    return deepClone(defaultProductionGrafanaCloudConfig);
  }

  /**
   * Local currently uses the disabled/default Grafana Cloud profile.
   *
   * If you later add defaultLocalGrafanaCloudConfig, this can be changed to
   * return deepClone(defaultLocalGrafanaCloudConfig).
   */
  if (profile === 'local') {
    return deepClone(defaultGrafanaCloudConfig);
  }

  return deepClone(defaultGrafanaCloudConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createGrafanaCloudConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const grafanaCloudConfig = createGrafanaCloudConfig();

export default grafanaCloudConfig;

function applyRootGrafanaCloudOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'GRAFANA_CLOUD_ENABLED', 'enabled');
}

function applyApiOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'GRAFANA_CLOUD_API_ENABLED', 'api.enabled');

  applyOptionalString(
    env,
    overrides,
    'GRAFANA_CLOUD_STACK_NAME',
    'api.stackName',
  );

  applyOptionalString(env, overrides, 'GRAFANA_CLOUD_REGION', 'api.region');

  applyOptionalString(
    env,
    overrides,
    'GRAFANA_CLOUD_STACK_URL',
    'api.stackUrl',
  );

  applyOptionalString(
    env,
    overrides,
    'GRAFANA_CLOUD_API_TOKEN_REF',
    'api.apiTokenRef',
  );

  applyOptionalInteger(
    env,
    overrides,
    'GRAFANA_CLOUD_API_TIMEOUT_MS',
    'api.timeoutMs',
  );
}

function applyFaroOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'FARO_ENABLED', 'addons.faro.enabled');

  applyOptionalBoolean(
    env,
    overrides,
    'NEXT_PUBLIC_FARO_ENABLED',
    'addons.faro.enabled',
  );

  applyOptionalString(env, overrides, 'FARO_URL', 'addons.faro.url');

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_FARO_URL',
    'addons.faro.url',
  );

  applyOptionalString(env, overrides, 'PUBLIC_FARO_URL', 'addons.faro.url');

  applyOptionalString(
    env,
    overrides,
    'FARO_PUBLIC_URL',
    'addons.faro.publicUrl',
  );

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_FARO_URL',
    'addons.faro.publicUrl',
  );

  applyOptionalString(
    env,
    overrides,
    'PUBLIC_FARO_URL',
    'addons.faro.publicUrl',
  );

  applyOptionalString(env, overrides, 'FARO_APP_NAME', 'addons.faro.appName');

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_APP_NAME',
    'addons.faro.appName',
  );

  applyOptionalString(
    env,
    overrides,
    'FARO_APP_NAMESPACE',
    'addons.faro.appNamespace',
  );

  applyOptionalString(
    env,
    overrides,
    'FARO_APP_VERSION',
    'addons.faro.appVersion',
  );

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_APP_VERSION',
    'addons.faro.appVersion',
  );

  applyOptionalString(env, overrides, 'FARO_RELEASE', 'addons.faro.release');

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_APP_RELEASE',
    'addons.faro.release',
  );

  applyOptionalString(
    env,
    overrides,
    'CF_PAGES_COMMIT_SHA',
    'addons.faro.release',
  );

  applyOptionalString(
    env,
    overrides,
    'FARO_ENVIRONMENT',
    'addons.faro.environment',
  );

  applyOptionalString(env, overrides, 'APP_ENV', 'addons.faro.environment');

  applyOptionalNumber(
    env,
    overrides,
    'FARO_SAMPLING_RATE',
    'addons.faro.samplingRate',
  );

  applyOptionalBoolean(
    env,
    overrides,
    'FARO_CAPTURE_ERRORS',
    'addons.faro.captureErrors',
  );

  applyOptionalBoolean(
    env,
    overrides,
    'FARO_CAPTURE_CONSOLE',
    'addons.faro.captureConsole',
  );

  applyOptionalBoolean(
    env,
    overrides,
    'FARO_CAPTURE_PERFORMANCE',
    'addons.faro.capturePerformance',
  );

  applySessionTrackingOverrides(env, overrides);
  applyFaroTracingOverrides(env, overrides);
}

function applySessionTrackingOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(
    env,
    overrides,
    'FARO_SESSION_TRACKING_ENABLED',
    'addons.faro.sessionTracking.enabled',
  );

  applyOptionalBoolean(
    env,
    overrides,
    'FARO_SESSION_TRACKING_PERSISTENT',
    'addons.faro.sessionTracking.persistent',
  );

  applyOptionalInteger(
    env,
    overrides,
    'FARO_MAX_SESSION_PERSISTENCE_TIME_MS',
    'addons.faro.sessionTracking.maxSessionPersistenceTimeMs',
  );
}

function applyFaroTracingOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(
    env,
    overrides,
    'FARO_TRACING_ENABLED',
    'addons.faro.tracing.enabled',
  );

  applyOptionalList(
    env,
    overrides,
    'FARO_TRACE_URLS',
    'addons.faro.tracing.traceUrls',
  );

  applyOptionalList(
    env,
    overrides,
    'FARO_PROPAGATE_TRACE_HEADER_CORS_URLS',
    'addons.faro.tracing.propagateTraceHeaderCorsUrls',
  );
}

function applyEnabledSignalsOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalList(
    env,
    overrides,
    'GRAFANA_CLOUD_ENABLED_SIGNALS',
    'addons.enabledSignals',
  );
}

function applyDerivedGrafanaCloudOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const faroUrl =
    getEnv(env, 'NEXT_PUBLIC_FARO_URL') ??
    getEnv(env, 'PUBLIC_FARO_URL') ??
    getEnv(env, 'FARO_PUBLIC_URL') ??
    getEnv(env, 'FARO_URL');

  const apiTokenRef =
    getEnv(env, 'GRAFANA_CLOUD_API_TOKEN_REF') ??
    (getEnv(env, 'GRAFANA_CLOUD_API_TOKEN')
      ? 'GRAFANA_CLOUD_API_TOKEN'
      : undefined);

  if (faroUrl !== undefined) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'addons.faro.enabled', true);
    setDeepValue(overrides, 'addons.faro.url', faroUrl);
    setDeepValue(overrides, 'addons.faro.publicUrl', faroUrl);
  }

  if (apiTokenRef !== undefined) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'api.enabled', true);
    setDeepValue(overrides, 'api.apiTokenRef', apiTokenRef);
  }

  const appName = getEnv(env, 'NEXT_PUBLIC_APP_NAME') ?? getEnv(env, 'APP_NAME');

  if (appName !== undefined && getEnv(env, 'FARO_APP_NAME') === undefined) {
    setDeepValue(overrides, 'addons.faro.appName', appName);
  }

  const appVersion =
    getEnv(env, 'NEXT_PUBLIC_APP_VERSION') ?? getEnv(env, 'APP_VERSION');

  if (
    appVersion !== undefined &&
    getEnv(env, 'FARO_APP_VERSION') === undefined
  ) {
    setDeepValue(overrides, 'addons.faro.appVersion', appVersion);
  }

  const release =
    getEnv(env, 'NEXT_PUBLIC_APP_RELEASE') ??
    getEnv(env, 'APP_RELEASE') ??
    getEnv(env, 'CF_PAGES_COMMIT_SHA');

  if (release !== undefined && getEnv(env, 'FARO_RELEASE') === undefined) {
    setDeepValue(overrides, 'addons.faro.release', release);
  }

  const environment = resolveAppEnvironment(env);

  if (getEnv(env, 'FARO_ENVIRONMENT') === undefined) {
    setDeepValue(overrides, 'addons.faro.environment', environment);
  }

  const appUrl =
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL') ??
    getEnv(env, 'APP_URL');

  if (
    appUrl !== undefined &&
    getEnv(env, 'FARO_TRACE_URLS') === undefined &&
    getEnvBoolean(env, 'FARO_TRACING_ENABLED') === true
  ) {
    setDeepValue(overrides, 'addons.faro.tracing.traceUrls', [appUrl]);

    setDeepValue(overrides, 'addons.faro.tracing.propagateTraceHeaderCorsUrls', [
      appUrl,
    ]);
  }

  if (getEnvBoolean(env, 'FARO_ENABLED') === undefined && faroUrl !== undefined) {
    setDeepValue(overrides, 'addons.faro.enabled', true);
  }

  if (
    getEnvBoolean(env, 'GRAFANA_CLOUD_ENABLED') === undefined &&
    (faroUrl !== undefined || apiTokenRef !== undefined)
  ) {
    setDeepValue(overrides, 'enabled', true);
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

function applyOptionalNumber(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvNumber(env, envKey);

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
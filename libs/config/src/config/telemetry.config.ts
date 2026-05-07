import type { TelemetryConfig } from '../types/telemetry';

import { defaultTelemetryConfig } from '../defaults/telemetry.defaults';
import { telemetrySchema } from '../schema/telemetry.schema';
import { deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvNumber,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type TelemetryConfigOptions = {
  name?: string;
  defaults?: TelemetryConfig;
};

export function createTelemetryConfig(
  env: EnvRecord = {},
  options: TelemetryConfigOptions = {},
): TelemetryConfig {
  const configName = options.name ?? 'telemetry config';
  const overrides = buildTelemetryConfigOverrides(env);

  const mergedConfig = deepMerge(
    options.defaults ?? defaultTelemetryConfig,
    overrides,
    {
      arrayStrategy: 'replace',
      undefinedStrategy: 'ignore',
    },
  );

  const validation = safeValidateConfig(telemetrySchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function buildTelemetryConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyOptionalBoolean(env, overrides, 'TELEMETRY_ENABLED', 'enabled');

  applyOptionalString(
    env,
    overrides,
    'PROFILE_ENCRYPTION_KEY',
    'profileEncryptionKey',
  );

  applyOptionalString(env, overrides, 'OTEL_SERVICE_NAME', 'otel.serviceName');

  applyOptionalString(
    env,
    overrides,
    'OTEL_TRACES_EXPORTER',
    'otel.tracesExporter',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_METRICS_EXPORTER',
    'otel.metricsExporter',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_LOGS_EXPORTER',
    'otel.logsExporter',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'otel.endpoint',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
    'otel.tracesEndpoint',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
    'otel.metricsEndpoint',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT',
    'otel.logsEndpoint',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_PROTOCOL',
    'otel.protocol',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_TRACES_PROTOCOL',
    'otel.tracesProtocol',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_METRICS_PROTOCOL',
    'otel.metricsProtocol',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_LOGS_PROTOCOL',
    'otel.logsProtocol',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_HEADERS',
    'otel.headers',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
    'otel.tracesHeaders',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
    'otel.metricsHeaders',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_EXPORTER_OTLP_LOGS_HEADERS',
    'otel.logsHeaders',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_RESOURCE_ATTRIBUTES',
    'otel.resourceAttributes',
  );

  applyOptionalString(
    env,
    overrides,
    'OTEL_NODE_RESOURCE_DETECTORS',
    'otel.nodeResourceDetectors',
  );

  applyOptionalString(env, overrides, 'OTEL_LOG_LEVEL', 'otel.logLevel');

  applyOptionalBoolean(env, overrides, 'FARO_ENABLED', 'faro.enabled');

  applyOptionalBoolean(
    env,
    overrides,
    'NEXT_PUBLIC_FARO_ENABLED',
    'faro.enabled',
  );

  applyOptionalString(env, overrides, 'NEXT_PUBLIC_FARO_URL', 'faro.publicUrl');

  applyOptionalString(env, overrides, 'PUBLIC_FARO_URL', 'faro.publicUrl');

  applyOptionalString(env, overrides, 'FARO_APP_NAME', 'faro.appName');

  applyOptionalString(env, overrides, 'NEXT_PUBLIC_APP_NAME', 'faro.appName');

  applyOptionalString(env, overrides, 'FARO_APP_NAMESPACE', 'faro.appNamespace');

  applyOptionalString(env, overrides, 'FARO_APP_VERSION', 'faro.appVersion');

  applyOptionalString(
    env,
    overrides,
    'NEXT_PUBLIC_APP_VERSION',
    'faro.appVersion',
  );

  applyOptionalString(env, overrides, 'FARO_RELEASE', 'faro.release');

  applyOptionalString(env, overrides, 'NEXT_PUBLIC_APP_RELEASE', 'faro.release');

  applyOptionalString(env, overrides, 'FARO_ENVIRONMENT', 'faro.environment');

  applyOptionalString(env, overrides, 'APP_ENV', 'faro.environment');

  applyOptionalNumber(env, overrides, 'FARO_SAMPLING_RATE', 'faro.samplingRate');

  applyOptionalBoolean(
    env,
    overrides,
    'FARO_TRACING_ENABLED',
    'faro.tracingEnabled',
  );

  if (hasTelemetrySignal(env)) {
    setDeepValue(overrides, 'enabled', true);
  }

  if (getEnv(env, 'NEXT_PUBLIC_FARO_URL') || getEnv(env, 'PUBLIC_FARO_URL')) {
    setDeepValue(overrides, 'faro.enabled', true);
  }

  return overrides;
}

/**
 * Backward-compatible default export.
 *
 * Prefer createTelemetryConfig(env) in platform/runtime code:
 * - Next.js can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const telemetryConfig = createTelemetryConfig();

export default telemetryConfig;

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

function hasTelemetrySignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'OTEL_TRACES_EXPORTER') ||
      getEnv(env, 'OTEL_METRICS_EXPORTER') ||
      getEnv(env, 'OTEL_LOGS_EXPORTER') ||
      getEnv(env, 'OTEL_EXPORTER_OTLP_ENDPOINT') ||
      getEnv(env, 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT') ||
      getEnv(env, 'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT') ||
      getEnv(env, 'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT') ||
      getEnv(env, 'NEXT_PUBLIC_FARO_URL') ||
      getEnv(env, 'PUBLIC_FARO_URL'),
  );
}
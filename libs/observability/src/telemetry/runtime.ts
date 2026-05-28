import { OpentelemetryCloud, TEMPO_API_TOKEN_ENV, TempoCloud } from '../constants/urls';
import { detectRuntime, readEnvValue } from '../logger/runtime';
import type {
  TelemetryBrowserOptions,
  TelemetryOptions,
  TelemetrySampling,
  TelemetryServerOptions,
} from './types';

const clampSampleRate = (value: number): number => Math.max(0, Math.min(1, value));

const readNumber = (env: Record<string, string | undefined> | undefined, key: string): number | undefined => {
  const rawValue = readEnvValue(env, key);

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);

  return Number.isFinite(parsed) ? clampSampleRate(parsed) : undefined;
};

export const resolveTelemetryRuntime = (options: TelemetryOptions): string => {
  return options.runtime ?? detectRuntime();
};

export const resolveTempoEndpoint = (
  options: TelemetryServerOptions | undefined,
  env: Record<string, string | undefined> | undefined,
): string | undefined => {
  return (
    options?.endpoint ??
    readEnvValue(env, 'TEMPO_OTLP_ENDPOINT') ??
    readEnvValue(env, 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT') ??
    OpentelemetryCloud.url
  );
};

export const resolveTempoToken = (
  options: TelemetryServerOptions | undefined,
  env: Record<string, string | undefined> | undefined,
): string | undefined => {
  return (
    options?.token ??
    readEnvValue(env, TEMPO_API_TOKEN_ENV) ??
    readEnvValue(env, 'OTEL_EXPORTER_OTLP_TOKEN')
  );
};

export const resolveTempoUsername = (
  options: TelemetryServerOptions | undefined,
  env: Record<string, string | undefined> | undefined,
): string | undefined => {
  return options?.username ?? readEnvValue(env, 'TEMPO_USERNAME') ?? TempoCloud.user;
};

export const resolveTelemetrySampleRate = (
  options: TelemetrySampling | undefined,
  env: Record<string, string | undefined> | undefined,
): number => {
  const explicitRate = options?.sampleRate;

  if (typeof explicitRate === 'number') {
    return clampSampleRate(explicitRate);
  }

  const envRate =
    readNumber(env, 'TEMPO_TRACE_SAMPLE_RATE') ??
    readNumber(env, 'OTEL_TRACES_SAMPLER_ARG') ??
    readNumber(env, 'FARO_SAMPLING_RATE');

  if (typeof envRate === 'number') {
    return envRate;
  }

  return readEnvValue(env, 'NODE_ENV') === 'production' ? 0.15 : 0;
};

export const resolveBrowserTelemetryOptions = (
  options: TelemetryBrowserOptions | undefined,
  env: Record<string, string | undefined> | undefined,
): Required<Pick<TelemetryBrowserOptions, 'enabled' | 'sampleRate'>> &
  Omit<TelemetryBrowserOptions, 'enabled' | 'sampleRate'> => {
  return {
    enabled: options?.enabled ?? readEnvValue(env, 'NODE_ENV') === 'production',
    sampleRate: resolveTelemetrySampleRate(options, env),
    url:
      options?.url ??
      readEnvValue(env, 'NEXT_PUBLIC_FARO_URL') ??
      readEnvValue(env, 'PUBLIC_FARO_URL') ??
      undefined,
    appName: options?.appName,
    appVersion: options?.appVersion,
    environment: options?.environment,
  };
};

export const resolveServerTelemetryOptions = (
  options: TelemetryServerOptions | undefined,
  env: Record<string, string | undefined> | undefined,
): Required<Pick<TelemetryServerOptions, 'enabled' | 'sampleRate'>> &
  Omit<TelemetryServerOptions, 'enabled' | 'sampleRate'> => {
  return {
    enabled: options?.enabled ?? readEnvValue(env, 'NODE_ENV') === 'production',
    sampleRate: resolveTelemetrySampleRate(options, env),
    endpoint: resolveTempoEndpoint(options, env),
    token: resolveTempoToken(options, env),
    username: resolveTempoUsername(options, env),
  };
};

export const buildTempoAuthorizationHeader = (
  username: string,
  token: string,
): string => {
  const credentials = `${username}:${token}`;
  const encodedCredentials =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(credentials)
      : Buffer.from(credentials).toString('base64');

  return `Basic ${encodedCredentials}`;
};

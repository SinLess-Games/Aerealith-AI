'use client';

import type { initializeFaro as initializeFaroType } from '@grafana/faro-web-sdk';

// This package is the source of truth for Helix config.
//
// TS6305 can appear in VS Code before @helix-ai/config has generated
// dist/libs/config/index.d.ts. The import is still correct; the generated
// declaration file is produced by building @helix-ai/config.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS6305: referenced project declarations may not exist before config build.
import { appConfig } from '@helix-ai/config';

type FaroInstance = ReturnType<typeof initializeFaroType>;

export type FaroClientConfig = {
  enabled: boolean;
  url: string;
  appName: string;
  appVersion: string;
  environment: string;
};

type FaroSourceConfig = Partial<{
  enabled: boolean;
  url: string;
  publicUrl: string;
  collectorUrl: string;
  appName: string;
  applicationName: string;
  appNamespace: string;
  appVersion: string;
  version: string;
  release: string;
  environment: string;
  env: string;
  samplingRate: number;
  captureErrors: boolean;
  captureConsole: boolean;
  capturePerformance: boolean;
}>;

type ConfigRecord = Record<string, unknown>;

type HelixWindow = Window & {
  __HELIX_FARO__?: FaroInstance | null;
};

let faroSingleton: FaroInstance | null = null;

function getEnv(name: string): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }

  const value = process.env[name];

  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function isDevelopment(): boolean {
  return getEnv('NODE_ENV') === 'development';
}

function isRecord(value: unknown): value is ConfigRecord {
  return typeof value === 'object' && value !== null;
}

function readConfigValue(path: string[]): unknown {
  let current: unknown = appConfig;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function readString(path: string[]): string | undefined {
  const value = readConfigValue(path);

  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function readBoolean(path: string[]): boolean | undefined {
  const value = readConfigValue(path);

  return typeof value === 'boolean' ? value : undefined;
}

function readNumber(path: string[]): number | undefined {
  const value = readConfigValue(path);

  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function resolveFaroSourceConfig(): FaroSourceConfig {
  return {
    enabled:
      readBoolean(['observability', 'faro', 'enabled']) ??
      readBoolean(['grafanaCloud', 'addons', 'faro', 'enabled']) ??
      readBoolean(['grafanaCloud', 'faro', 'enabled']) ??
      readBoolean(['addons', 'faro', 'enabled']),

    url:
      readString(['observability', 'faro', 'url']) ??
      readString(['observability', 'faro', 'publicUrl']) ??
      readString(['observability', 'faro', 'collectorUrl']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'url']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'publicUrl']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'collectorUrl']) ??
      readString(['grafanaCloud', 'faro', 'url']) ??
      readString(['grafanaCloud', 'faro', 'publicUrl']) ??
      readString(['grafanaCloud', 'faro', 'collectorUrl']) ??
      readString(['addons', 'faro', 'url']) ??
      readString(['addons', 'faro', 'publicUrl']) ??
      readString(['addons', 'faro', 'collectorUrl']),

    publicUrl:
      readString(['observability', 'faro', 'publicUrl']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'publicUrl']) ??
      readString(['grafanaCloud', 'faro', 'publicUrl']) ??
      readString(['addons', 'faro', 'publicUrl']),

    collectorUrl:
      readString(['observability', 'faro', 'collectorUrl']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'collectorUrl']) ??
      readString(['grafanaCloud', 'faro', 'collectorUrl']) ??
      readString(['addons', 'faro', 'collectorUrl']),

    appName:
      readString(['observability', 'faro', 'appName']) ??
      readString(['observability', 'faro', 'applicationName']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'appName']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'applicationName']) ??
      readString(['grafanaCloud', 'faro', 'appName']) ??
      readString(['grafanaCloud', 'faro', 'applicationName']) ??
      readString(['addons', 'faro', 'appName']) ??
      readString(['addons', 'faro', 'applicationName']),

    applicationName:
      readString(['observability', 'faro', 'applicationName']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'applicationName']) ??
      readString(['grafanaCloud', 'faro', 'applicationName']) ??
      readString(['addons', 'faro', 'applicationName']),

    appNamespace:
      readString(['observability', 'faro', 'appNamespace']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'appNamespace']) ??
      readString(['grafanaCloud', 'faro', 'appNamespace']) ??
      readString(['addons', 'faro', 'appNamespace']),

    appVersion:
      readString(['observability', 'faro', 'appVersion']) ??
      readString(['observability', 'faro', 'version']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'appVersion']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'version']) ??
      readString(['grafanaCloud', 'faro', 'appVersion']) ??
      readString(['grafanaCloud', 'faro', 'version']) ??
      readString(['addons', 'faro', 'appVersion']) ??
      readString(['addons', 'faro', 'version']),

    version:
      readString(['observability', 'faro', 'version']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'version']) ??
      readString(['grafanaCloud', 'faro', 'version']) ??
      readString(['addons', 'faro', 'version']),

    release:
      readString(['observability', 'faro', 'release']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'release']) ??
      readString(['grafanaCloud', 'faro', 'release']) ??
      readString(['addons', 'faro', 'release']),

    environment:
      readString(['observability', 'faro', 'environment']) ??
      readString(['observability', 'faro', 'env']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'environment']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'env']) ??
      readString(['grafanaCloud', 'faro', 'environment']) ??
      readString(['grafanaCloud', 'faro', 'env']) ??
      readString(['addons', 'faro', 'environment']) ??
      readString(['addons', 'faro', 'env']),

    env:
      readString(['observability', 'faro', 'env']) ??
      readString(['grafanaCloud', 'addons', 'faro', 'env']) ??
      readString(['grafanaCloud', 'faro', 'env']) ??
      readString(['addons', 'faro', 'env']),

    samplingRate:
      readNumber(['observability', 'faro', 'samplingRate']) ??
      readNumber(['grafanaCloud', 'addons', 'faro', 'samplingRate']) ??
      readNumber(['grafanaCloud', 'faro', 'samplingRate']) ??
      readNumber(['addons', 'faro', 'samplingRate']),

    captureErrors:
      readBoolean(['observability', 'faro', 'captureErrors']) ??
      readBoolean(['grafanaCloud', 'addons', 'faro', 'captureErrors']) ??
      readBoolean(['grafanaCloud', 'faro', 'captureErrors']) ??
      readBoolean(['addons', 'faro', 'captureErrors']),

    captureConsole:
      readBoolean(['observability', 'faro', 'captureConsole']) ??
      readBoolean(['grafanaCloud', 'addons', 'faro', 'captureConsole']) ??
      readBoolean(['grafanaCloud', 'faro', 'captureConsole']) ??
      readBoolean(['addons', 'faro', 'captureConsole']),

    capturePerformance:
      readBoolean(['observability', 'faro', 'capturePerformance']) ??
      readBoolean(['grafanaCloud', 'addons', 'faro', 'capturePerformance']) ??
      readBoolean(['grafanaCloud', 'faro', 'capturePerformance']) ??
      readBoolean(['addons', 'faro', 'capturePerformance']),
  };
}

function buildConfig(
  overrides: Partial<FaroClientConfig> = {},
): FaroClientConfig | null {
  const faroConfig = resolveFaroSourceConfig();

  const enabled = overrides.enabled ?? faroConfig.enabled ?? true;

  if (!enabled) {
    return null;
  }

  const url =
    overrides.url ??
    faroConfig.url ??
    faroConfig.publicUrl ??
    faroConfig.collectorUrl ??
    getEnv('NEXT_PUBLIC_FARO_URL') ??
    getEnv('NEXT_PUBLIC_GRAFANA_FARO_URL');

  if (!url) {
    return null;
  }

  return {
    enabled,
    url,
    appName:
      overrides.appName ??
      faroConfig.appName ??
      faroConfig.applicationName ??
      getEnv('NEXT_PUBLIC_FARO_APP_NAME') ??
      getEnv('NEXT_PUBLIC_APP_NAME') ??
      'helix-app',
    appVersion:
      overrides.appVersion ??
      faroConfig.appVersion ??
      faroConfig.version ??
      faroConfig.release ??
      getEnv('NEXT_PUBLIC_FARO_APP_VERSION') ??
      getEnv('NEXT_PUBLIC_APP_VERSION') ??
      getEnv('NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA') ??
      'dev',
    environment:
      overrides.environment ??
      faroConfig.environment ??
      faroConfig.env ??
      getEnv('NEXT_PUBLIC_FARO_APP_ENV') ??
      getEnv('NEXT_PUBLIC_APP_ENV') ??
      getEnv('NODE_ENV') ??
      'development',
  };
}

function getStoredFaro(): FaroInstance | null {
  if (faroSingleton) {
    return faroSingleton;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  return (window as HelixWindow).__HELIX_FARO__ ?? null;
}

function setStoredFaro(faro: FaroInstance | null): void {
  faroSingleton = faro;

  if (typeof window !== 'undefined') {
    (window as HelixWindow).__HELIX_FARO__ = faro;
  }
}

export async function initFaro(
  overrides: Partial<FaroClientConfig> = {},
): Promise<FaroInstance | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const existingFaro = getStoredFaro();

  if (existingFaro) {
    return existingFaro;
  }

  const config = buildConfig(overrides);

  if (!config) {
    if (isDevelopment()) {
      console.info('[Faro] configuration missing or disabled; skipping.');
    }

    return null;
  }

  try {
    if (isDevelopment()) {
      console.info('[Faro] initializing', {
        app: {
          name: config.appName,
          version: config.appVersion,
          environment: config.environment,
        },
      });
    }

    const [
      { getWebInstrumentations, initializeFaro },
      { TracingInstrumentation },
    ] = await Promise.all([
      import('@grafana/faro-web-sdk'),
      import('@grafana/faro-web-tracing'),
    ]);

    const faro = initializeFaro({
      url: config.url,
      app: {
        name: config.appName,
        version: config.appVersion,
        environment: config.environment,
      },
      instrumentations: [
        ...getWebInstrumentations(),
        new TracingInstrumentation(),
      ],
    });

    setStoredFaro(faro);

    return faro;
  } catch (error) {
    console.error(
      '[Faro] failed to initialize:',
      error instanceof Error ? error.message : error,
    );

    setStoredFaro(null);

    return null;
  }
}

export function getFaroInstance(): FaroInstance | null {
  return getStoredFaro();
}

import type { RuntimeMode } from '../logger/types';

export type TelemetrySampling = {
  enabled?: boolean;
  sampleRate?: number;
};

export type TelemetryBrowserOptions = TelemetrySampling & {
  url?: string;
  appName?: string;
  appVersion?: string;
  environment?: string;
};

export type TelemetryServerOptions = TelemetrySampling & {
  endpoint?: string;
  token?: string;
  username?: string;
};

export type TelemetryOptions = {
  service: string;
  env?: Record<string, string | undefined>;
  runtime?: RuntimeMode;
  browser?: TelemetryBrowserOptions;
  server?: TelemetryServerOptions;
};

export type TelemetryHandle = {
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
};

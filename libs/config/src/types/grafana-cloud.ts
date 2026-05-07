export type GrafanaCloudRegion =
  | 'us'
  | 'eu'
  | 'au'
  | 'prod-us-central-0'
  | 'prod-eu-west-0'
  | 'prod-eu-west-2'
  | (string & {});

export type GrafanaCloudSignal =
  | 'logs'
  | 'metrics'
  | 'traces'
  | 'profiles'
  | 'frontend'
  | 'frontend-observability'
  | (string & {});

export interface GrafanaCloudApiConfig {
  /**
   * Whether Grafana Cloud API integrations are enabled.
   */
  enabled: boolean;

  /**
   * Grafana Cloud stack slug/name.
   */
  stackName?: string;

  /**
   * Grafana Cloud stack region.
   */
  region?: GrafanaCloudRegion;

  /**
   * Base URL for the Grafana Cloud stack.
   *
   * Example:
   * https://<stack-name>.grafana.net
   */
  stackUrl?: string;

  /**
   * Secret reference name for a Grafana Cloud API token.
   *
   * Do not store the token value here.
   */
  apiTokenRef?: string;
}

export interface FaroSessionTrackingConfig {
  /**
   * Whether Faro session tracking is enabled.
   *
   * Faro session tracking is enabled by default by the SDK unless the
   * instrumentation list is overwritten.
   */
  enabled: boolean;

  /**
   * Whether sessions should persist across browser/tab restarts.
   *
   * Persistent sessions use browser localStorage. Non-persistent sessions use
   * sessionStorage.
   */
  persistent?: boolean;

  /**
   * Maximum session persistence time in milliseconds.
   */
  maxSessionPersistenceTimeMs?: number;
}

export interface FaroTracingConfig {
  /**
   * Whether frontend tracing is enabled.
   */
  enabled: boolean;

  /**
   * URL patterns that should be traced by the frontend instrumentation.
   */
  traceUrls?: Array<string | RegExp>;

  /**
   * Whether distributed tracing headers should be propagated to matching URLs.
   */
  propagateTraceHeaderCorsUrls?: Array<string | RegExp>;
}

export interface FaroConfig {
  /**
   * Whether Grafana Faro / Frontend Observability is enabled.
   */
  enabled: boolean;

  /**
   * Grafana Faro collector URL.
   *
   * Backward-compatible field from the old config.
   */
  url?: string | null;

  /**
   * Alias for url, useful when sharing the shape with telemetry config.
   */
  publicUrl?: string | null;

  /**
   * Application name sent to Faro app metadata.
   */
  appName?: string;

  /**
   * Optional application namespace sent to Faro app metadata.
   */
  appNamespace?: string;

  /**
   * Optional application version sent to Faro app metadata.
   */
  appVersion?: string;

  /**
   * Optional release identifier, such as a commit SHA or deployment ID.
   */
  release?: string;

  /**
   * Runtime environment sent to Faro app metadata.
   */
  environment?: string;

  /**
   * Optional client-side sampling rate.
   *
   * Expected range:
   * 0.0 - 1.0
   */
  samplingRate?: number;

  /**
   * Whether errors should be captured by Faro instrumentation.
   */
  captureErrors?: boolean;

  /**
   * Whether console logs should be captured by Faro instrumentation.
   */
  captureConsole?: boolean;

  /**
   * Whether web vitals/performance instrumentation should be enabled.
   */
  capturePerformance?: boolean;

  /**
   * Session tracking options.
   */
  sessionTracking?: FaroSessionTrackingConfig;

  /**
   * Frontend tracing options.
   */
  tracing?: FaroTracingConfig;

  /**
   * Extra non-sensitive metadata attached to frontend telemetry.
   *
   * Do not put personal data or secrets here.
   */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GrafanaCloudAddonConfig {
  /**
   * Grafana Faro / Frontend Observability config.
   */
  faro?: FaroConfig;

  /**
   * Enabled Grafana Cloud signal categories.
   */
  enabledSignals?: GrafanaCloudSignal[];
}

export interface GrafanaCloudConfig {
  /**
   * Whether Grafana Cloud integration is enabled.
   */
  enabled: boolean;

  /**
   * Grafana Cloud API/stack settings.
   */
  api?: GrafanaCloudApiConfig;

  /**
   * Optional Grafana Cloud add-ons used by Helix.
   */
  addons?: GrafanaCloudAddonConfig;
}
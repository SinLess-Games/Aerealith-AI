export type OpenTelemetryTracesExporter = 'otlp' | 'zipkin' | 'console' | 'none' | string;

export type OpenTelemetryMetricsExporter = 'otlp' | 'prometheus' | 'console' | 'none' | string;

export type OpenTelemetryLogsExporter = 'otlp' | 'console' | 'none' | string;

export type OpenTelemetryProtocol = 'grpc' | 'http/protobuf' | 'http/json' | string;

export type OpenTelemetryLogLevel =
  | 'none'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'verbose'
  | 'all'
  | string;

export interface OpenTelemetryConfig {
  /**
   * Maps to OTEL_SERVICE_NAME.
   */
  serviceName?: string;

  /**
   * Maps to OTEL_TRACES_EXPORTER.
   *
   * Common values: otlp, zipkin, console, none.
   */
  tracesExporter?: OpenTelemetryTracesExporter;

  /**
   * Maps to OTEL_METRICS_EXPORTER.
   *
   * Common values: otlp, prometheus, console, none.
   */
  metricsExporter?: OpenTelemetryMetricsExporter;

  /**
   * Maps to OTEL_LOGS_EXPORTER.
   *
   * Common values: otlp, console, none.
   */
  logsExporter?: OpenTelemetryLogsExporter;

  /**
   * Maps to OTEL_EXPORTER_OTLP_ENDPOINT.
   *
   * This is the shared base OTLP endpoint. Signal-specific endpoints may override it.
   */
  endpoint?: string;

  /**
   * Maps to OTEL_EXPORTER_OTLP_TRACES_ENDPOINT.
   */
  tracesEndpoint?: string;

  /**
   * Maps to OTEL_EXPORTER_OTLP_METRICS_ENDPOINT.
   */
  metricsEndpoint?: string;

  /**
   * Maps to OTEL_EXPORTER_OTLP_LOGS_ENDPOINT.
   */
  logsEndpoint?: string;

  /**
   * Maps to OTEL_EXPORTER_OTLP_PROTOCOL.
   */
  protocol?: OpenTelemetryProtocol;

  /**
   * Maps to OTEL_EXPORTER_OTLP_TRACES_PROTOCOL.
   */
  tracesProtocol?: OpenTelemetryProtocol;

  /**
   * Maps to OTEL_EXPORTER_OTLP_METRICS_PROTOCOL.
   */
  metricsProtocol?: OpenTelemetryProtocol;

  /**
   * Maps to OTEL_EXPORTER_OTLP_LOGS_PROTOCOL.
   */
  logsProtocol?: OpenTelemetryProtocol;

  /**
   * Maps to OTEL_EXPORTER_OTLP_HEADERS.
   *
   * Keep this as a string because OpenTelemetry env vars use the W3C baggage format:
   * key1=value1,key2=value2
   */
  headers?: string;

  /**
   * Maps to OTEL_EXPORTER_OTLP_TRACES_HEADERS.
   */
  tracesHeaders?: string;

  /**
   * Maps to OTEL_EXPORTER_OTLP_METRICS_HEADERS.
   */
  metricsHeaders?: string;

  /**
   * Maps to OTEL_EXPORTER_OTLP_LOGS_HEADERS.
   */
  logsHeaders?: string;

  /**
   * Maps to OTEL_RESOURCE_ATTRIBUTES.
   *
   * Format:
   * key1=value1,key2=value2
   */
  resourceAttributes?: string;

  /**
   * Maps to OTEL_NODE_RESOURCE_DETECTORS.
   *
   * Common values:
   * env,host,os,process,serviceinstance,all,none
   */
  nodeResourceDetectors?: string;

  /**
   * Maps to OTEL_LOG_LEVEL.
   */
  logLevel?: OpenTelemetryLogLevel;
}

export interface FaroConfig {
  /**
   * Whether frontend observability is enabled.
   */
  enabled: boolean;

  /**
   * Grafana Faro collector URL.
   *
   * Previous env name:
   * NEXT_PUBLIC_FARO_URL
   */
  publicUrl?: string;

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
   * Whether Faro should include browser tracing when @grafana/faro-web-tracing is installed.
   */
  tracingEnabled?: boolean;
}

export interface TelemetryConfig {
  /**
   * Global telemetry enablement.
   */
  enabled: boolean;

  /**
   * Optional encryption key reference/name for telemetry profile data.
   *
   * Do not store the actual secret value in committed config.
   */
  profileEncryptionKey?: string;

  /**
   * Backend/service telemetry configuration.
   */
  otel: OpenTelemetryConfig;

  /**
   * Frontend/browser observability configuration.
   */
  faro: FaroConfig;
}
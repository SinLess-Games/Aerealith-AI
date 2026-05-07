import type { TelemetryConfig } from '../types/telemetry';

export const defaultTelemetryConfig = {
  enabled: false,

  /**
   * Secret/reference name only.
   *
   * Do not place the actual encryption key in committed config.
   */
  profileEncryptionKey: undefined,

  otel: {
    serviceName: 'helix',

    /**
     * Keep automatic exporters disabled by default.
     *
     * Enable these per environment when Grafana Cloud, an OTEL Collector,
     * or another telemetry backend is configured.
     */
    tracesExporter: 'none',
    metricsExporter: 'none',
    logsExporter: 'none',

    endpoint: undefined,
    tracesEndpoint: undefined,
    metricsEndpoint: undefined,
    logsEndpoint: undefined,

    /**
     * OTLP supports grpc, http/protobuf, and http/json.
     */
    protocol: 'http/protobuf',
    tracesProtocol: undefined,
    metricsProtocol: undefined,
    logsProtocol: undefined,

    headers: undefined,
    tracesHeaders: undefined,
    metricsHeaders: undefined,
    logsHeaders: undefined,

    resourceAttributes: 'service.name=helix,deployment.environment=development',
    nodeResourceDetectors: 'env,host,os,process',

    logLevel: 'info',
  },

  faro: {
    enabled: false,

    publicUrl: undefined,

    appName: 'Helix AI',
    appNamespace: 'helix',
    appVersion: undefined,
    release: undefined,
    environment: 'development',

    samplingRate: 1,

    tracingEnabled: false,
  },
} satisfies TelemetryConfig;

export default defaultTelemetryConfig;
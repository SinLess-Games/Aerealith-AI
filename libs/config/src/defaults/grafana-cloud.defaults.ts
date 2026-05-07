import type { GrafanaCloudConfig } from '../types/grafana-cloud';

export const defaultGrafanaCloudConfig = {
  enabled: false,

  api: {
    enabled: false,

    /**
     * Grafana Cloud stack slug/name.
     *
     * Example:
     * helix-ai
     */
    stackName: undefined,

    /**
     * Keep region unset by default.
     *
     * Grafana Cloud regions are stack-specific and should be configured per
     * environment.
     */
    region: undefined,

    /**
     * Example:
     * https://helix-ai.grafana.net
     */
    stackUrl: undefined,

    /**
     * Secret reference only.
     *
     * Do not store the actual token in committed config.
     */
    apiTokenRef: undefined,
  },

  addons: {
    faro: {
      enabled: false,

      /**
       * Grafana Faro collector URL.
       *
       * Keep unset unless frontend observability is enabled.
       */
      url: null,

      publicUrl: null,

      appName: 'Helix AI',
      appNamespace: 'helix',
      appVersion: undefined,
      release: undefined,
      environment: 'development',

      /**
       * Faro sampling is session-based and accepts values from 0 to 1.
       */
      samplingRate: 1,

      captureErrors: true,
      captureConsole: false,
      capturePerformance: true,

      sessionTracking: {
        enabled: false,
        persistent: true,
        maxSessionPersistenceTimeMs: 4 * 60 * 60 * 1000,
      },

      tracing: {
        enabled: false,
        traceUrls: [],
        propagateTraceHeaderCorsUrls: [],
      },

      metadata: {
        service: 'frontend',
        owner: 'SinLess Games LLC',
      },
    },

    enabledSignals: [],
  },
} satisfies GrafanaCloudConfig;

export const defaultProductionGrafanaCloudConfig = {
  enabled: true,

  api: {
    enabled: false,

    stackName: undefined,
    region: undefined,
    stackUrl: undefined,
    apiTokenRef: 'GRAFANA_CLOUD_API_TOKEN',
  },

  addons: {
    faro: {
      enabled: false,

      /**
       * Set this from NEXT_PUBLIC_FARO_URL or Cloudflare public runtime config
       * when frontend observability is ready.
       */
      url: null,

      publicUrl: null,

      appName: 'Helix AI',
      appNamespace: 'helix',
      appVersion: undefined,
      release: undefined,
      environment: 'production',

      samplingRate: 1,

      captureErrors: true,
      captureConsole: false,
      capturePerformance: true,

      sessionTracking: {
        enabled: true,
        persistent: true,
        maxSessionPersistenceTimeMs: 4 * 60 * 60 * 1000,
      },

      tracing: {
        enabled: false,
        traceUrls: ['https://helixaibot.com'],
        propagateTraceHeaderCorsUrls: ['https://helixaibot.com'],
      },

      metadata: {
        service: 'frontend',
        domain: 'helixaibot.com',
        owner: 'SinLess Games LLC',
      },
    },

    enabledSignals: [
      'frontend-observability',
      'logs',
      'metrics',
      'traces',
    ],
  },
} satisfies GrafanaCloudConfig;

export const defaultLocalGrafanaCloudConfig = {
  enabled: false,

  api: {
    enabled: false,
    stackName: undefined,
    region: undefined,
    stackUrl: undefined,
    apiTokenRef: undefined,
  },

  addons: {
    faro: {
      enabled: false,

      url: null,
      publicUrl: null,

      appName: 'Helix AI',
      appNamespace: 'helix',
      appVersion: undefined,
      release: undefined,
      environment: 'development',

      samplingRate: 1,

      captureErrors: true,
      captureConsole: true,
      capturePerformance: false,

      sessionTracking: {
        enabled: false,
        persistent: false,
        maxSessionPersistenceTimeMs: undefined,
      },

      tracing: {
        enabled: false,
        traceUrls: ['http://localhost:3000', 'http://localhost:8787'],
        propagateTraceHeaderCorsUrls: [
          'http://localhost:3000',
          'http://localhost:8787',
        ],
      },

      metadata: {
        service: 'frontend',
        runtime: 'local',
      },
    },

    enabledSignals: [],
  },
} satisfies GrafanaCloudConfig;

export default defaultGrafanaCloudConfig;
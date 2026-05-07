import type { AppConfig } from '../types/app';

import { defaultAuthConfig, defaultProductionAuthConfig } from './auth.defaults';
import {
  defaultCloudflareConfig,
  defaultProductionCloudflareConfig,
} from './cloudflare.defaults';
import {
  defaultCloudflareHyperdriveDatabaseConfig,
  defaultDatabaseConfig,
} from './database.defaults';
import { defaultDiscordConfig } from './discord.defaults'
import {
  defaultGithubConfig,
  defaultGithubOAuthConfig,
} from './github.defaults';
import {
  defaultGrafanaCloudConfig,
  defaultProductionGrafanaCloudConfig,
} from './grafana-cloud.defaults';
import {
  defaultRedisConfig,
  defaultUpstashRedisConfig,
} from './redis.defaults';
import {
  defaultProductionSecurityConfig,
  defaultSecurityConfig,
} from './security.defaults';
import {
  defaultCloudflareServicesConfig,
  defaultServicesConfig,
} from './services.defaults';
import {
  defaultCloudflareR2StorageConfig,
  defaultStorageConfig,
} from './storage.defaults';
import { defaultTelemetryConfig } from './telemetry.defaults';

export const defaultAppConfig = {
  environment: 'development',

  runtime: 'node',

  app: {
    name: 'helix',
    displayName: 'Helix AI',
    version: undefined,
    release: undefined,
    owner: 'SinLess Games LLC',
    url: 'http://localhost:3000',
    domain: 'localhost',
  },

  cloudflare: defaultCloudflareConfig,

  database: defaultDatabaseConfig,

  storage: defaultStorageConfig,

  github: defaultGithubConfig,

  discord: defaultDiscordConfig,

  grafanaCloud: defaultGrafanaCloudConfig,

  security: defaultSecurityConfig,

  auth: defaultAuthConfig,

  telemetry: defaultTelemetryConfig,

  services: defaultServicesConfig,

  redis: defaultRedisConfig,

  publicRuntime: {
    appName: 'Helix AI',
    appUrl: 'http://localhost:3000',
    environment: 'development',
    release: undefined,
    faroUrl: undefined,
    discordApplicationId: undefined,
    githubClientId: undefined,
    googleClientId: undefined,
    turnstileSiteKey: undefined,
    profileEncryptionKey: undefined,
  },

  publicTokens: undefined,
} satisfies AppConfig;

export const defaultCloudflareAppConfig = {
  environment: 'production',

  runtime: 'cloudflare-worker',

  app: {
    name: 'helix',
    displayName: 'Helix AI',
    version: undefined,
    release: undefined,
    owner: 'SinLess Games LLC',
    url: 'https://helixaibot.com',
    domain: 'helixaibot.com',
  },

  cloudflare: defaultProductionCloudflareConfig,

  database: defaultCloudflareHyperdriveDatabaseConfig,

  storage: defaultCloudflareR2StorageConfig,

  github: defaultGithubOAuthConfig,

  discord: defaultDiscordConfig,

  grafanaCloud: defaultProductionGrafanaCloudConfig,

  security: defaultProductionSecurityConfig,

  auth: defaultProductionAuthConfig,

  telemetry: {
    ...defaultTelemetryConfig,
    enabled: false,
    otel: {
      ...defaultTelemetryConfig.otel,
      serviceName: 'helix',
      resourceAttributes:
        'service.name=helix,deployment.environment=production',
    },
    faro: {
      ...defaultTelemetryConfig.faro,
      enabled: false,
      appName: 'Helix AI',
      appNamespace: 'helix',
      environment: 'production',
      publicUrl: undefined,
      tracingEnabled: false,
    },
  },

  services: defaultCloudflareServicesConfig,

  redis: defaultUpstashRedisConfig,

  publicRuntime: {
    appName: 'Helix AI',
    appUrl: 'https://helixaibot.com',
    environment: 'production',
    release: undefined,

    /**
     * Browser-safe public values only.
     *
     * In Next.js, NEXT_PUBLIC_* values are bundled into client-side JavaScript.
     */
    faroUrl: undefined,
    discordApplicationId: undefined,
    githubClientId: undefined,
    googleClientId: undefined,
    turnstileSiteKey: undefined,

    /**
     * Do not expose encryption material publicly.
     */
    profileEncryptionKey: undefined,
  },

  publicTokens: undefined,
} satisfies AppConfig;

export const defaultLocalAppConfig = {
  environment: 'development',

  runtime: 'nextjs',

  app: {
    name: 'helix',
    displayName: 'Helix AI',
    version: undefined,
    release: undefined,
    owner: 'SinLess Games LLC',
    url: 'http://localhost:3000',
    domain: 'localhost',
  },

  cloudflare: defaultCloudflareConfig,

  database: defaultDatabaseConfig,

  storage: defaultStorageConfig,

  github: defaultGithubConfig,

  discord: defaultDiscordConfig,

  grafanaCloud: defaultGrafanaCloudConfig,

  security: defaultSecurityConfig,

  auth: defaultAuthConfig,

  telemetry: defaultTelemetryConfig,

  services: defaultServicesConfig,

  redis: defaultRedisConfig,

  publicRuntime: {
    appName: 'Helix AI',
    appUrl: 'http://localhost:3000',
    environment: 'development',
    release: undefined,
    faroUrl: undefined,
    discordApplicationId: undefined,
    githubClientId: undefined,
    googleClientId: undefined,
    turnstileSiteKey: undefined,
    profileEncryptionKey: undefined,
  },

  publicTokens: undefined,
} satisfies AppConfig;

export default defaultAppConfig;
import type { AuthConfig } from './auth';
import type { CloudflareConfig } from './cloudflare';
import type { DatabaseConfig } from './database';
import type { DiscordConfig } from './discord';
import type { GithubConfig } from './github';
import type { GrafanaCloudConfig } from './grafana-cloud';
import type { RedisConfig } from './redis';
import type { RoutesConfig } from './routes';
import type { SecurityConfig } from './security';
import type { ServicesConfig } from './services';
import type { StorageConfig } from './storage';
import type { TelemetryConfig } from './telemetry';

export type AppEnvironment =
  | 'development'
  | 'preview'
  | 'staging'
  | 'production'
  | 'test'
  | string;

export type AppRuntime =
  | 'browser'
  | 'nextjs'
  | 'cloudflare-worker'
  | 'node'
  | 'container'
  | 'kubernetes'
  | 'local'
  | string;

export interface AppIdentityConfig {
  /**
   * Internal app/service name.
   *
   * Example:
   * helix
   */
  name: string;

  /**
   * Human-friendly product name.
   *
   * Example:
   * Helix AI
   */
  displayName: string;

  /**
   * App version.
   */
  version?: string;

  /**
   * Deployment/release identifier.
   *
   * Example:
   * git commit SHA, Cloudflare Worker version ID, Docker image tag.
   */
  release?: string;

  /**
   * Company/owner name.
   */
  owner?: string;

  /**
   * Primary public site URL.
   *
   * Example:
   * https://helixaibot.com
   */
  url?: string;

  /**
   * Primary domain.
   *
   * Example:
   * helixaibot.com
   */
  domain?: string;
}

export interface PublicRuntimeConfig {
  /**
   * Public values that are safe to expose to browser/client runtimes.
   *
   * Do not put secrets, private keys, tokens, database URLs, or encryption keys here.
   */
  appName?: string;

  /**
   * Public application URL.
   */
  appUrl?: string;

  /**
   * Public deployment environment.
   */
  environment?: AppEnvironment;

  /**
   * Public release identifier.
   */
  release?: string;

  /**
   * Public Grafana Faro collector URL, if frontend telemetry is enabled.
   */
  faroUrl?: string;

  /**
   * Public Discord application ID, if Discord integrations are exposed in UI.
   */
  discordApplicationId?: string;

  /**
   * Public GitHub OAuth client ID, if GitHub login is exposed in UI.
   */
  githubClientId?: string;

  /**
   * Public Google OAuth client ID, if Google login is exposed in UI.
   */
  googleClientId?: string;

  /**
   * Public Cloudflare Turnstile site key, if Turnstile is enabled.
   */
  turnstileSiteKey?: string;

  /**
   * Backward-compatible field from the old config.
   *
   * Prefer not to expose encryption material publicly.
   */
  profileEncryptionKey?: string;
}

export interface AppConfig {
  /**
   * Current deployment environment.
   */
  environment: AppEnvironment;

  /**
   * Runtime consuming this config.
   */
  runtime: AppRuntime;

  /**
   * App identity and release metadata.
   */
  app: AppIdentityConfig;

  /**
   * Cloudflare platform config.
   */
  cloudflare: CloudflareConfig;

  /**
   * Database config.
   */
  database: DatabaseConfig;

  /**
   * Object/file storage config.
   */
  storage: StorageConfig;

  /**
   * GitHub integration config.
   */
  github: GithubConfig;

  /**
   * Discord integration config.
   */
  discord: DiscordConfig;

  /**
   * Grafana Cloud integration config.
   */
  grafanaCloud: GrafanaCloudConfig;

  /**
   * Security policy config.
   */
  security: SecurityConfig;

  /**
   * Authentication config.
   */
  auth: AuthConfig;

  /**
   * Route registry config.
   */
  routes: RoutesConfig;

  /**
   * Telemetry/observability config.
   */
  telemetry: TelemetryConfig;

  /**
   * Service registry config.
   */
  services: ServicesConfig;

  /**
   * Redis-compatible cache/session/rate-limit config.
   */
  redis: RedisConfig;

  /**
   * Public runtime config.
   *
   * Only place browser-safe values here.
   */
  publicRuntime: PublicRuntimeConfig;

  /**
   * Backward-compatible alias from the old config.
   *
   * Prefer publicRuntime in new code.
   */
  publicTokens?: {
    /**
     * Old NEXT_PUBLIC_PROFILE_ENCRYPTION_KEY mapping.
     *
     * Do not put real encryption secrets in public config.
     */
    profileEncryptionKey?: string;
  };
}
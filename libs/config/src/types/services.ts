export type ServiceProtocol =
  | 'http'
  | 'https'
  | 'grpc'
  | 'websocket'
  | 'cloudflare-service-binding'
  | 'cloudflare-rpc'
  | 'queue'
  | 'event'
  | 'internal'
  | string;

export type ServiceRuntime =
  | 'cloudflare-worker'
  | 'cloudflare-durable-object'
  | 'cloudflare-workflow'
  | 'node'
  | 'container'
  | 'kubernetes'
  | 'browser'
  | 'external-saas'
  | 'unknown'
  | string;

export type ServiceExposure =
  | 'public'
  | 'private'
  | 'internal'
  | 'edge'
  | 'admin'
  | 'webhook'
  | string;

export type ServiceHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'unhealthy'
  | 'unknown'
  | string;

export interface ServiceEndpointConfig {
  /**
   * Logical endpoint name.
   *
   * Examples:
   * public, internal, admin, metrics, health
   */
  name: string;

  /**
   * Endpoint protocol.
   */
  protocol: ServiceProtocol;

  /**
   * Endpoint URL.
   *
   * Keep optional because Cloudflare Service Bindings and RPC services may not
   * have or need public URLs.
   */
  url?: string;

  /**
   * Optional base path for HTTP-style services.
   *
   * Example:
   * /api/users
   */
  basePath?: string;

  /**
   * Optional health check path for HTTP-style services.
   *
   * Example:
   * /healthz
   */
  healthPath?: string;

  /**
   * Optional request timeout in milliseconds.
   */
  timeoutMs?: number;

  /**
   * Whether this endpoint is public, private, admin-only, webhook-only, etc.
   */
  exposure: ServiceExposure;

  /**
   * Optional static headers that are safe to store in config.
   *
   * Do not store secret header values here.
   */
  headers?: Record<string, string>;

  /**
   * Names of secret references required by this endpoint.
   *
   * Example:
   * GITHUB_WEBHOOK_SECRET
   */
  requiredSecretRefs?: string[];
}

export interface CloudflareServiceBindingConfig {
  /**
   * Binding name exposed on the Cloudflare Worker env object.
   *
   * Example:
   * USER_SERVICE
   */
  binding: string;

  /**
   * Target Worker service name from wrangler config.
   */
  service: string;

  /**
   * Optional named WorkerEntrypoint for Cloudflare RPC.
   */
  entrypoint?: string;

  /**
   * Whether this binding is expected to use Cloudflare Worker RPC.
   */
  rpcEnabled?: boolean;
}

export interface ServiceQueueConfig {
  /**
   * Logical queue name.
   *
   * Example:
   * user-events
   */
  name: string;

  /**
   * Runtime binding name.
   *
   * Example:
   * USER_EVENTS_QUEUE
   */
  binding?: string;

  /**
   * Physical provider queue name.
   */
  queue?: string;

  /**
   * Event types this queue receives or publishes.
   */
  eventTypes?: string[];

  /**
   * Whether this service consumes from the queue.
   */
  consumes?: boolean;

  /**
   * Whether this service publishes to the queue.
   */
  publishes?: boolean;
}

export interface ServiceDependencyConfig {
  /**
   * Logical dependency service key.
   *
   * Example:
   * users, auth, events
   */
  service: string;

  /**
   * Whether the dependency is required for startup/operation.
   */
  required: boolean;

  /**
   * Preferred dependency access mode.
   */
  protocol?: ServiceProtocol;

  /**
   * Optional endpoint name used for this dependency.
   */
  endpoint?: string;

  /**
   * Optional Cloudflare Service Binding name used for this dependency.
   */
  binding?: string;

  /**
   * Optional reason this dependency exists.
   */
  purpose?: string;
}

export interface ServiceRetryConfig {
  /**
   * Whether retries are enabled.
   */
  enabled: boolean;

  /**
   * Maximum retry attempts.
   */
  attempts?: number;

  /**
   * Initial delay before retrying, in milliseconds.
   */
  initialDelayMs?: number;

  /**
   * Maximum delay between retries, in milliseconds.
   */
  maxDelayMs?: number;

  /**
   * Backoff multiplier.
   */
  backoffMultiplier?: number;
}

export interface ServiceRateLimitConfig {
  /**
   * Whether rate limiting is enabled for this service.
   */
  enabled: boolean;

  /**
   * Maximum requests allowed in the window.
   */
  limit?: number;

  /**
   * Rate limit window in seconds.
   */
  windowSeconds?: number;

  /**
   * Optional keying strategy.
   *
   * Examples:
   * ip, user, tenant, organization, api-key
   */
  keyBy?: string;
}

export interface ServiceConfig {
  /**
   * Logical service key.
   *
   * Examples:
   * frontend, api-gateway, auth, users, events, agents
   */
  name: string;

  /**
   * Human-friendly service display name.
   */
  displayName?: string;

  /**
   * Whether this service is enabled in the current deployment.
   */
  enabled: boolean;

  /**
   * Runtime hosting/execution environment.
   */
  runtime: ServiceRuntime;

  /**
   * Optional service version.
   */
  version?: string;

  /**
   * Optional deployment environment.
   *
   * Examples:
   * development, preview, staging, production
   */
  environment?: string;

  /**
   * Optional service owner/team.
   */
  owner?: string;

  /**
   * Optional service description.
   */
  description?: string;

  /**
   * Public, private, internal, admin, webhook, etc.
   */
  exposure: ServiceExposure;

  /**
   * Endpoint definitions for this service.
   */
  endpoints?: Record<string, ServiceEndpointConfig>;

  /**
   * Cloudflare Service Binding / RPC settings.
   */
  cloudflareBinding?: CloudflareServiceBindingConfig;

  /**
   * Queues this service publishes to or consumes from.
   */
  queues?: Record<string, ServiceQueueConfig>;

  /**
   * Other services this service depends on.
   */
  dependencies?: ServiceDependencyConfig[];

  /**
   * Retry policy for outgoing calls.
   */
  retry?: ServiceRetryConfig;

  /**
   * Rate limit policy for incoming calls.
   */
  rateLimit?: ServiceRateLimitConfig;

  /**
   * Required configuration keys for this service.
   */
  requiredConfigKeys?: string[];

  /**
   * Required secret reference names for this service.
   *
   * Store secret names here, not secret values.
   */
  requiredSecretRefs?: string[];

  /**
   * Optional tags for filtering, dashboards, ownership, or deployment rules.
   */
  tags?: string[];

  /**
   * Optional metadata for platform-specific use.
   */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ServicesConfig {
  /**
   * Global services enablement.
   */
  enabled: boolean;

  /**
   * Default timeout for service-to-service requests, in milliseconds.
   */
  defaultTimeoutMs?: number;

  /**
   * Default retry policy for service-to-service calls.
   */
  defaultRetry?: ServiceRetryConfig;

  /**
   * Registry of known Helix services.
   */
  registry: Record<string, ServiceConfig>;
}
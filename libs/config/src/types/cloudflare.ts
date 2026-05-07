export type CloudflareEnvironment =
  | 'development'
  | 'preview'
  | 'staging'
  | 'production'
  | 'test'
  | string;

export type CloudflareWorkerRuntime =
  | 'workers'
  | 'pages'
  | 'workers-static-assets'
  | 'opennext'
  | string;

export type CloudflareRouteMode =
  | 'route'
  | 'custom-domain'
  | 'workers-dev'
  | 'preview'
  | string;

export type CloudflareBindingKind =
  | 'vars'
  | 'secrets'
  | 'kv'
  | 'r2'
  | 'queue'
  | 'durable-object'
  | 'd1'
  | 'hyperdrive'
  | 'vectorize'
  | 'service'
  | 'workflow'
  | 'ai'
  | 'analytics-engine'
  | 'browser-rendering'
  | 'dispatch-namespace'
  | string;

export type CloudflareServiceBindingMode =
  | 'fetch'
  | 'rpc'
  | string;

export type CloudflareQueueRole =
  | 'producer'
  | 'consumer'
  | 'producer-consumer'
  | string;

export type CloudflareDurableObjectStorage =
  | 'sqlite'
  | 'kv'
  | 'none'
  | string;

export interface CloudflareRouteConfig {
  /**
   * Route pattern.
   *
   * Example:
   * helixaibot.com/*
   */
  pattern: string;

  /**
   * Zone name.
   *
   * Example:
   * helixaibot.com
   */
  zoneName?: string;

  /**
   * Zone ID, if you prefer ID-based config.
   */
  zoneId?: string;

  /**
   * Routing mode.
   */
  mode: CloudflareRouteMode;

  /**
   * Whether this route is enabled.
   */
  enabled: boolean;
}

export interface CloudflareCustomDomainConfig {
  /**
   * Hostname bound directly to the Worker.
   *
   * Example:
   * helixaibot.com
   */
  hostname: string;

  /**
   * Zone name.
   */
  zoneName?: string;

  /**
   * Zone ID.
   */
  zoneId?: string;

  /**
   * Whether this custom domain is enabled.
   */
  enabled: boolean;
}

export interface CloudflareVarConfig {
  /**
   * Plaintext, non-secret runtime variables.
   *
   * Do not store passwords, tokens, or API keys here.
   */
  values: Record<string, string | number | boolean | null | Record<string, unknown>>;
}

export interface CloudflareSecretsConfig {
  /**
   * Required secret binding names.
   *
   * Example:
   * DATABASE_URL, DISCORD_BOT_TOKEN, GITHUB_APP_PRIVATE_KEY
   *
   * Store names only, not secret values.
   */
  required: string[];

  /**
   * Optional secret names used in local development.
   *
   * Store names only, not values.
   */
  optional?: string[];

  /**
   * Preferred local secret file.
   *
   * Cloudflare supports .dev.vars and .env files for local development.
   */
  localFile?: '.dev.vars' | '.env' | string;
}

export interface CloudflareKvNamespaceBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * FEATURE_FLAGS
   */
  binding: string;

  /**
   * KV namespace ID.
   */
  id?: string;

  /**
   * Preview KV namespace ID.
   */
  previewId?: string;

  /**
   * Logical purpose.
   *
   * Example:
   * feature-flags, cache, sessions
   */
  purpose?: string;
}

export interface CloudflareR2BucketBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * HELIX_UPLOADS_BUCKET
   */
  binding: string;

  /**
   * R2 bucket name.
   */
  bucketName: string;

  /**
   * Preview R2 bucket name.
   */
  previewBucketName?: string;

  /**
   * Optional public/custom domain for this bucket.
   */
  publicUrl?: string;

  /**
   * Logical purpose.
   *
   * Example:
   * uploads, exports, artifacts
   */
  purpose?: string;
}

export interface CloudflareQueueBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * USER_EVENTS_QUEUE
   */
  binding: string;

  /**
   * Physical queue name.
   */
  queueName: string;

  /**
   * Producer/consumer role for this Worker.
   */
  role: CloudflareQueueRole;

  /**
   * Event types expected on this queue.
   */
  eventTypes?: string[];

  /**
   * Optional dead-letter queue name.
   */
  deadLetterQueueName?: string;

  /**
   * Maximum consumer batch size.
   */
  maxBatchSize?: number;

  /**
   * Maximum consumer batch timeout in seconds.
   */
  maxBatchTimeoutSeconds?: number;

  /**
   * Maximum retries for queue message processing.
   */
  maxRetries?: number;
}

export interface CloudflareDurableObjectBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * SESSION_OBJECT
   */
  binding: string;

  /**
   * Durable Object class name.
   */
  className: string;

  /**
   * Optional script/service name if bound from another Worker.
   */
  scriptName?: string;

  /**
   * Storage backend/posture.
   */
  storage?: CloudflareDurableObjectStorage;

  /**
   * Logical purpose.
   *
   * Example:
   * websocket-sessions, locks, actor-state
   */
  purpose?: string;
}

export interface CloudflareD1DatabaseBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * DB
   */
  binding: string;

  /**
   * D1 database name.
   */
  databaseName: string;

  /**
   * D1 database ID.
   */
  databaseId?: string;

  /**
   * Preview D1 database ID.
   */
  previewDatabaseId?: string;

  /**
   * Whether this database is only a secondary/edge metadata store.
   */
  secondaryOnly?: boolean;
}

export interface CloudflareHyperdriveBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * HYPERDRIVE
   */
  binding: string;

  /**
   * Hyperdrive config ID.
   */
  id?: string;

  /**
   * Secret reference containing the origin database URL used to create/manage
   * the Hyperdrive config.
   *
   * Do not store the actual database URL here.
   */
  originDatabaseUrlRef?: string;

  /**
   * Logical purpose.
   *
   * Example:
   * primary-postgres, analytics-postgres
   */
  purpose?: string;
}

export interface CloudflareVectorizeBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * MEMORY_INDEX
   */
  binding: string;

  /**
   * Vectorize index name.
   */
  indexName: string;

  /**
   * Optional index ID.
   */
  indexId?: string;

  /**
   * Embedding dimensions expected by this index.
   */
  dimensions?: number;

  /**
   * Logical purpose.
   *
   * Example:
   * semantic-memory, document-search
   */
  purpose?: string;
}

export interface CloudflareServiceBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * USER_SERVICE
   */
  binding: string;

  /**
   * Target Worker service name.
   */
  service: string;

  /**
   * Optional named Worker entrypoint for RPC.
   */
  entrypoint?: string;

  /**
   * Binding mode.
   */
  mode: CloudflareServiceBindingMode;

  /**
   * Logical purpose.
   */
  purpose?: string;
}

export interface CloudflareWorkflowBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * USER_ONBOARDING_WORKFLOW
   */
  binding: string;

  /**
   * Workflow name.
   */
  name: string;

  /**
   * Workflow class name.
   */
  className?: string;

  /**
   * Logical purpose.
   */
  purpose?: string;
}

export interface CloudflareAiBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * AI
   */
  binding: string;

  /**
   * Whether Workers AI is enabled.
   */
  enabled: boolean;

  /**
   * Default model identifier.
   */
  defaultModel?: string;
}

export interface CloudflareAnalyticsEngineBindingConfig {
  /**
   * Worker binding name.
   */
  binding: string;

  /**
   * Dataset name.
   */
  dataset?: string;

  /**
   * Logical purpose.
   */
  purpose?: string;
}

export interface CloudflareBrowserRenderingBindingConfig {
  /**
   * Worker binding name.
   *
   * Example:
   * BROWSER
   */
  binding: string;

  /**
   * Whether browser rendering is enabled.
   */
  enabled: boolean;
}

export interface CloudflareDispatchNamespaceBindingConfig {
  /**
   * Worker binding name.
   */
  binding: string;

  /**
   * Dispatch namespace name.
   */
  namespace: string;

  /**
   * Logical purpose.
   */
  purpose?: string;
}

export interface CloudflareBindingsConfig {
  /**
   * Plaintext non-secret variables.
   */
  vars?: CloudflareVarConfig;

  /**
   * Required/optional secret names.
   */
  secrets?: CloudflareSecretsConfig;

  /**
   * KV namespace bindings.
   */
  kvNamespaces?: Record<string, CloudflareKvNamespaceBindingConfig>;

  /**
   * R2 bucket bindings.
   */
  r2Buckets?: Record<string, CloudflareR2BucketBindingConfig>;

  /**
   * Queue bindings.
   */
  queues?: Record<string, CloudflareQueueBindingConfig>;

  /**
   * Durable Object bindings.
   */
  durableObjects?: Record<string, CloudflareDurableObjectBindingConfig>;

  /**
   * D1 database bindings.
   */
  d1Databases?: Record<string, CloudflareD1DatabaseBindingConfig>;

  /**
   * Hyperdrive bindings.
   */
  hyperdrive?: Record<string, CloudflareHyperdriveBindingConfig>;

  /**
   * Vectorize index bindings.
   */
  vectorize?: Record<string, CloudflareVectorizeBindingConfig>;

  /**
   * Worker service bindings.
   */
  services?: Record<string, CloudflareServiceBindingConfig>;

  /**
   * Workflow bindings.
   */
  workflows?: Record<string, CloudflareWorkflowBindingConfig>;

  /**
   * Workers AI binding.
   */
  ai?: CloudflareAiBindingConfig;

  /**
   * Analytics Engine bindings.
   */
  analyticsEngine?: Record<string, CloudflareAnalyticsEngineBindingConfig>;

  /**
   * Browser Rendering binding.
   */
  browserRendering?: CloudflareBrowserRenderingBindingConfig;

  /**
   * Dispatch namespace bindings.
   */
  dispatchNamespaces?: Record<string, CloudflareDispatchNamespaceBindingConfig>;
}

export interface CloudflarePlacementConfig {
  /**
   * Whether Cloudflare Smart Placement is enabled.
   */
  enabled: boolean;

  /**
   * Placement mode.
   *
   * Example:
   * smart
   */
  mode?: string;
}

export interface CloudflareLimitsConfig {
  /**
   * Soft max request body size in bytes for app-level validation.
   */
  maxRequestBodyBytes?: number;

  /**
   * App-level request timeout in milliseconds.
   */
  requestTimeoutMs?: number;

  /**
   * App-level CPU budget hint in milliseconds.
   */
  cpuBudgetMs?: number;
}

export interface CloudflareWorkerConfig {
  /**
   * Worker/service name.
   */
  name: string;

  /**
   * Worker runtime family.
   */
  runtime: CloudflareWorkerRuntime;

  /**
   * Main entrypoint path.
   *
   * Example:
   * src/index.ts
   */
  main?: string;

  /**
   * Cloudflare compatibility date.
   *
   * Example:
   * 2026-05-07
   */
  compatibilityDate?: string;

  /**
   * Cloudflare compatibility flags.
   *
   * Example:
   * nodejs_compat
   */
  compatibilityFlags?: string[];

  /**
   * Whether workers.dev should be enabled.
   */
  workersDev?: boolean;

  /**
   * Routes for this Worker.
   */
  routes?: CloudflareRouteConfig[];

  /**
   * Custom domains for this Worker.
   */
  customDomains?: CloudflareCustomDomainConfig[];

  /**
   * Resource bindings for this Worker.
   */
  bindings?: CloudflareBindingsConfig;

  /**
   * Placement options.
   */
  placement?: CloudflarePlacementConfig;

  /**
   * Application-level limits/hints.
   */
  limits?: CloudflareLimitsConfig;

  /**
   * Optional tags for ownership, dashboards, or deployment routing.
   */
  tags?: string[];

  /**
   * Optional platform-specific metadata.
   */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CloudflareEnvironmentConfig {
  /**
   * Environment name.
   */
  name: CloudflareEnvironment;

  /**
   * Optional Worker name override for this environment.
   */
  workerName?: string;

  /**
   * Environment-specific routes.
   */
  routes?: CloudflareRouteConfig[];

  /**
   * Environment-specific custom domains.
   */
  customDomains?: CloudflareCustomDomainConfig[];

  /**
   * Environment-specific bindings.
   *
   * Important: many Wrangler binding keys are not inherited by environments,
   * so define environment-specific bindings explicitly.
   */
  bindings?: CloudflareBindingsConfig;

  /**
   * Environment-specific compatibility date.
   */
  compatibilityDate?: string;

  /**
   * Environment-specific compatibility flags.
   */
  compatibilityFlags?: string[];

  /**
   * Whether this environment is deployable from CI.
   */
  deployable?: boolean;

  /**
   * Whether this environment requires manual approval.
   */
  requiresApproval?: boolean;
}

export interface CloudflareAccountConfig {
  /**
   * Cloudflare account ID.
   */
  accountId?: string;

  /**
   * Secret reference for the Cloudflare API token used by CI/CD.
   *
   * Do not store the actual token value here.
   */
  apiTokenRef?: string;

  /**
   * Default zone ID.
   */
  zoneId?: string;

  /**
   * Default zone name.
   *
   * Example:
   * helixaibot.com
   */
  zoneName?: string;
}

export interface CloudflareCiConfig {
  /**
   * Whether Cloudflare deployments are managed by CI.
   */
  enabled: boolean;

  /**
   * CI provider name.
   *
   * Example:
   * github-actions
   */
  provider?: string;

  /**
   * Secret reference for CLOUDFLARE_ACCOUNT_ID.
   */
  accountIdRef?: string;

  /**
   * Secret reference for CLOUDFLARE_API_TOKEN.
   */
  apiTokenRef?: string;

  /**
   * Whether production deploys require manual approval.
   */
  productionApprovalRequired?: boolean;

  /**
   * Whether Worker Versions / Gradual Deployments are used.
   */
  gradualDeploymentsEnabled?: boolean;
}

export interface CloudflareConfig {
  /**
   * Whether Cloudflare integration is enabled.
   */
  enabled: boolean;

  /**
   * Default Cloudflare environment.
   */
  defaultEnvironment: CloudflareEnvironment;

  /**
   * Account/zone config.
   */
  account: CloudflareAccountConfig;

  /**
   * Primary Worker config for this app/package.
   */
  worker?: CloudflareWorkerConfig;

  /**
   * Environment-specific Worker config.
   */
  environments?: Record<string, CloudflareEnvironmentConfig>;

  /**
   * CI/CD config.
   */
  ci?: CloudflareCiConfig;

  /**
   * Required binding kinds used by this deployment.
   */
  requiredBindingKinds?: CloudflareBindingKind[];

  /**
   * Optional metadata for platform automation.
   */
  metadata?: Record<string, string | number | boolean | null>;
}
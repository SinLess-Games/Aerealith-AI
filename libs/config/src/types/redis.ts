export type RedisProvider =
  | 'redis'
  | 'valkey'
  | 'upstash'
  | 'dragonfly'
  | 'elasticache'
  | 'memory'
  | 'disabled'
  | string;

export type RedisTransport =
  | 'tcp'
  | 'tls'
  | 'http'
  | 'rest'
  | 'cloudflare-binding'
  | 'memory'
  | string;

export type RedisRole =
  | 'cache'
  | 'session'
  | 'rate-limit'
  | 'queue'
  | 'pubsub'
  | 'lock'
  | 'feature-flags'
  | string;

export interface RedisTlsConfig {
  /**
   * Whether TLS is required for Redis connections.
   */
  enabled: boolean;

  /**
   * Whether certificate validation should be required.
   */
  rejectUnauthorized?: boolean;

  /**
   * Optional CA certificate secret/reference name.
   *
   * Do not store certificate contents here.
   */
  caRef?: string;

  /**
   * Optional client certificate secret/reference name.
   */
  certRef?: string;

  /**
   * Optional client key secret/reference name.
   */
  keyRef?: string;
}

export interface RedisRestConfig {
  /**
   * REST/HTTP endpoint URL.
   *
   * Useful for Upstash and edge/serverless runtimes.
   */
  url?: string;

  /**
   * Token secret reference name.
   *
   * Do not store the actual token value in config.
   */
  tokenRef?: string;

  /**
   * Optional header name used for token auth.
   */
  tokenHeader?: string;
}

export interface RedisConnectionConfig {
  /**
   * Full Redis connection URL.
   *
   * Example:
   * redis://user:password@localhost:6379/0
   *
   * Prefer urlRef for production secrets.
   */
  url?: string;

  /**
   * Secret/environment reference that contains the Redis connection URL.
   *
   * Example:
   * REDIS_URL
   */
  urlRef?: string;

  /**
   * Redis hostname for TCP/TLS connections.
   */
  host?: string;

  /**
   * Redis port.
   */
  port?: number;

  /**
   * Redis username.
   *
   * Prefer usernameRef if this is secret-managed.
   */
  username?: string;

  /**
   * Secret/environment reference that contains the Redis username.
   */
  usernameRef?: string;

  /**
   * Redis password.
   *
   * Avoid committing this value. Prefer passwordRef.
   */
  password?: string;

  /**
   * Secret/environment reference that contains the Redis password.
   */
  passwordRef?: string;

  /**
   * Redis logical database number.
   */
  database?: number;

  /**
   * Connection transport.
   *
   * Cloudflare Workers can use HTTP/REST Redis clients such as Upstash,
   * or TCP sockets where appropriate.
   */
  transport: RedisTransport;

  /**
   * TLS options for TCP/TLS Redis connections.
   */
  tls?: RedisTlsConfig;

  /**
   * REST/HTTP options for edge/serverless Redis providers.
   */
  rest?: RedisRestConfig;

  /**
   * Optional Cloudflare binding name if the runtime injects this config.
   */
  binding?: string;

  /**
   * Connection timeout in milliseconds.
   */
  connectTimeoutMs?: number;

  /**
   * Command timeout in milliseconds.
   */
  commandTimeoutMs?: number;

  /**
   * Whether the client should enable lazy connection behavior when supported.
   */
  lazyConnect?: boolean;

  /**
   * Maximum retry attempts for Redis operations.
   */
  maxRetries?: number;
}

export interface RedisCacheConfig {
  /**
   * Prefix applied to cache keys.
   */
  prefix?: string;

  /**
   * Backward-compatible alias for prefix.
   */
  cachePrefix?: string;

  /**
   * Default cache expiration in milliseconds.
   */
  expirationMs?: number;

  /**
   * Backward-compatible alias for expirationMs.
   */
  cacheExpirationMs?: number;

  /**
   * Default cache expiration in seconds.
   *
   * Useful for Redis EX commands.
   */
  ttlSeconds?: number;

  /**
   * Whether stale reads are allowed by the application when supported.
   */
  staleReadsEnabled?: boolean;
}

export interface RedisInstanceConfig {
  /**
   * Logical Redis instance name.
   *
   * Examples:
   * default, cache, sessions, rate-limit
   */
  name: string;

  /**
   * Whether this Redis instance is enabled.
   */
  enabled: boolean;

  /**
   * Provider backing this Redis instance.
   */
  provider: RedisProvider;

  /**
   * Primary purpose/role for this Redis instance.
   */
  role: RedisRole;

  /**
   * Connection settings.
   */
  connection: RedisConnectionConfig;

  /**
   * Cache behavior defaults for this instance.
   */
  cache?: RedisCacheConfig;

  /**
   * Optional key namespace used by this instance.
   */
  namespace?: string;

  /**
   * Optional tags for routing, dashboards, ownership, or deployment rules.
   */
  tags?: string[];

  /**
   * Optional provider/runtime-specific metadata.
   */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RedisConfig {
  /**
   * Global Redis enablement.
   */
  enabled: boolean;

  /**
   * Default Redis instance key.
   */
  defaultInstance?: string;

  /**
   * Registry of Redis instances.
   */
  instances: Record<string, RedisInstanceConfig>;

  /**
   * Backward-compatible flat connection URL.
   *
   * Prefer instances.default.connection.url or urlRef in new code.
   */
  url?: string;

  /**
   * Backward-compatible flat host.
   */
  host?: string;

  /**
   * Backward-compatible flat username.
   */
  username?: string;

  /**
   * Backward-compatible flat password.
   *
   * Prefer passwordRef in new code.
   */
  password?: string;

  /**
   * Backward-compatible flat port.
   */
  port?: number;

  /**
   * Backward-compatible cache prefix.
   */
  cachePrefix?: string;

  /**
   * Backward-compatible cache expiration in milliseconds.
   */
  cacheExpirationMs?: number;
}
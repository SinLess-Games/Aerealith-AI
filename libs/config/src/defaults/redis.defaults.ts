import type { RedisConfig } from '../types/redis';

export const defaultRedisConfig = {
  enabled: false,

  defaultInstance: undefined,

  instances: {},

  /**
   * Backward-compatible flat fields.
   *
   * Keep unset by default. New code should use instances instead.
   */
  url: undefined,
  host: undefined,
  username: undefined,
  password: undefined,
  port: undefined,
  cachePrefix: undefined,
  cacheExpirationMs: undefined,
} satisfies RedisConfig;

export const defaultUpstashRedisConfig = {
  enabled: true,

  defaultInstance: 'cache',

  instances: {
    cache: {
      name: 'cache',
      enabled: true,
      provider: 'upstash',
      role: 'cache',

      connection: {
        url: undefined,
        urlRef: 'UPSTASH_REDIS_REST_URL',

        host: undefined,
        port: undefined,

        username: undefined,
        usernameRef: undefined,

        password: undefined,
        passwordRef: 'UPSTASH_REDIS_REST_TOKEN',

        database: undefined,

        /**
         * Upstash Redis is HTTP/REST based, which is the cleanest option for
         * Cloudflare Workers and other edge/serverless runtimes.
         */
        transport: 'rest',

        tls: undefined,

        rest: {
          url: undefined,
          tokenRef: 'UPSTASH_REDIS_REST_TOKEN',
          tokenHeader: 'Authorization',
        },

        binding: undefined,

        connectTimeoutMs: 5_000,
        commandTimeoutMs: 5_000,
        lazyConnect: false,
        maxRetries: 3,
      },

      cache: {
        prefix: 'helix:cache:',
        cachePrefix: 'helix:cache:',
        expirationMs: 15 * 60 * 1000,
        cacheExpirationMs: 15 * 60 * 1000,
        ttlSeconds: 15 * 60,
        staleReadsEnabled: true,
      },

      namespace: 'helix',
      tags: ['cache', 'upstash', 'cloudflare', 'edge'],
      metadata: {
        runtime: 'cloudflare-worker',
      },
    },

    session: {
      name: 'session',
      enabled: true,
      provider: 'upstash',
      role: 'session',

      connection: {
        url: undefined,
        urlRef: 'UPSTASH_REDIS_REST_URL',

        host: undefined,
        port: undefined,

        username: undefined,
        usernameRef: undefined,

        password: undefined,
        passwordRef: 'UPSTASH_REDIS_REST_TOKEN',

        database: undefined,

        transport: 'rest',

        tls: undefined,

        rest: {
          url: undefined,
          tokenRef: 'UPSTASH_REDIS_REST_TOKEN',
          tokenHeader: 'Authorization',
        },

        binding: undefined,

        connectTimeoutMs: 5_000,
        commandTimeoutMs: 5_000,
        lazyConnect: false,
        maxRetries: 3,
      },

      cache: {
        prefix: 'helix:session:',
        cachePrefix: 'helix:session:',
        expirationMs: 30 * 24 * 60 * 60 * 1000,
        cacheExpirationMs: 30 * 24 * 60 * 60 * 1000,
        ttlSeconds: 30 * 24 * 60 * 60,
        staleReadsEnabled: false,
      },

      namespace: 'helix',
      tags: ['session', 'upstash', 'cloudflare', 'edge'],
      metadata: {
        runtime: 'cloudflare-worker',
      },
    },

    rateLimit: {
      name: 'rateLimit',
      enabled: true,
      provider: 'upstash',
      role: 'rate-limit',

      connection: {
        url: undefined,
        urlRef: 'UPSTASH_REDIS_REST_URL',

        host: undefined,
        port: undefined,

        username: undefined,
        usernameRef: undefined,

        password: undefined,
        passwordRef: 'UPSTASH_REDIS_REST_TOKEN',

        database: undefined,

        transport: 'rest',

        tls: undefined,

        rest: {
          url: undefined,
          tokenRef: 'UPSTASH_REDIS_REST_TOKEN',
          tokenHeader: 'Authorization',
        },

        binding: undefined,

        connectTimeoutMs: 5_000,
        commandTimeoutMs: 5_000,
        lazyConnect: false,
        maxRetries: 2,
      },

      cache: {
        prefix: 'helix:rate-limit:',
        cachePrefix: 'helix:rate-limit:',
        expirationMs: 60 * 1000,
        cacheExpirationMs: 60 * 1000,
        ttlSeconds: 60,
        staleReadsEnabled: false,
      },

      namespace: 'helix',
      tags: ['rate-limit', 'upstash', 'cloudflare', 'edge'],
      metadata: {
        runtime: 'cloudflare-worker',
      },
    },

    featureFlags: {
      name: 'featureFlags',
      enabled: true,
      provider: 'upstash',
      role: 'feature-flags',

      connection: {
        url: undefined,
        urlRef: 'UPSTASH_REDIS_REST_URL',

        host: undefined,
        port: undefined,

        username: undefined,
        usernameRef: undefined,

        password: undefined,
        passwordRef: 'UPSTASH_REDIS_REST_TOKEN',

        database: undefined,

        transport: 'rest',

        tls: undefined,

        rest: {
          url: undefined,
          tokenRef: 'UPSTASH_REDIS_REST_TOKEN',
          tokenHeader: 'Authorization',
        },

        binding: undefined,

        connectTimeoutMs: 5_000,
        commandTimeoutMs: 5_000,
        lazyConnect: false,
        maxRetries: 3,
      },

      cache: {
        prefix: 'helix:flags:',
        cachePrefix: 'helix:flags:',
        expirationMs: 5 * 60 * 1000,
        cacheExpirationMs: 5 * 60 * 1000,
        ttlSeconds: 5 * 60,
        staleReadsEnabled: true,
      },

      namespace: 'helix',
      tags: ['feature-flags', 'upstash', 'cloudflare', 'edge'],
      metadata: {
        runtime: 'cloudflare-worker',
      },
    },
  },

  /**
   * Backward-compatible flat fields.
   *
   * These point at the same secret/reference names used by the default cache
   * instance, but new code should read instances.cache.connection instead.
   */
  url: undefined,
  host: undefined,
  username: undefined,
  password: undefined,
  port: undefined,
  cachePrefix: 'helix:cache:',
  cacheExpirationMs: 15 * 60 * 1000,
} satisfies RedisConfig;

export const defaultLocalRedisConfig = {
  enabled: true,

  defaultInstance: 'cache',

  instances: {
    cache: {
      name: 'cache',
      enabled: true,
      provider: 'memory',
      role: 'cache',

      connection: {
        url: undefined,
        urlRef: undefined,

        host: undefined,
        port: undefined,

        username: undefined,
        usernameRef: undefined,

        password: undefined,
        passwordRef: undefined,

        database: undefined,

        transport: 'memory',

        tls: undefined,
        rest: undefined,
        binding: undefined,

        connectTimeoutMs: undefined,
        commandTimeoutMs: undefined,
        lazyConnect: false,
        maxRetries: 0,
      },

      cache: {
        prefix: 'helix:local:cache:',
        cachePrefix: 'helix:local:cache:',
        expirationMs: 15 * 60 * 1000,
        cacheExpirationMs: 15 * 60 * 1000,
        ttlSeconds: 15 * 60,
        staleReadsEnabled: false,
      },

      namespace: 'helix-local',
      tags: ['cache', 'memory', 'local'],
      metadata: {
        runtime: 'local',
      },
    },
  },

  url: undefined,
  host: undefined,
  username: undefined,
  password: undefined,
  port: undefined,
  cachePrefix: 'helix:local:cache:',
  cacheExpirationMs: 15 * 60 * 1000,
} satisfies RedisConfig;

export const defaultTcpRedisConfig = {
  enabled: true,

  defaultInstance: 'cache',

  instances: {
    cache: {
      name: 'cache',
      enabled: true,
      provider: 'redis',
      role: 'cache',

      connection: {
        url: undefined,
        urlRef: 'REDIS_URL',

        host: 'localhost',
        port: 6379,

        username: undefined,
        usernameRef: undefined,

        password: undefined,
        passwordRef: 'REDIS_PASSWORD',

        database: 0,

        transport: 'tcp',

        tls: {
          enabled: false,
          rejectUnauthorized: true,
          caRef: undefined,
          certRef: undefined,
          keyRef: undefined,
        },

        rest: undefined,
        binding: undefined,

        connectTimeoutMs: 5_000,
        commandTimeoutMs: 5_000,
        lazyConnect: true,
        maxRetries: 3,
      },

      cache: {
        prefix: 'helix:cache:',
        cachePrefix: 'helix:cache:',
        expirationMs: 15 * 60 * 1000,
        cacheExpirationMs: 15 * 60 * 1000,
        ttlSeconds: 15 * 60,
        staleReadsEnabled: false,
      },

      namespace: 'helix',
      tags: ['cache', 'redis', 'tcp'],
      metadata: {
        runtime: 'node',
      },
    },
  },

  url: undefined,
  host: 'localhost',
  username: undefined,
  password: undefined,
  port: 6379,
  cachePrefix: 'helix:cache:',
  cacheExpirationMs: 15 * 60 * 1000,
} satisfies RedisConfig;

export default defaultRedisConfig;
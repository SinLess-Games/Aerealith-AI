import { z } from 'zod';

import type { RedisConfig } from '../types/redis';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const optionalUrlSchema = z.string().trim().url().optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const redisProviderSchema = nonEmptyStringSchema;

export const redisTransportSchema = nonEmptyStringSchema;

export const redisRoleSchema = nonEmptyStringSchema;

export const redisTlsSchema = z
  .object({
    enabled: z.boolean().default(false),

    rejectUnauthorized: z.boolean().optional(),

    caRef: optionalNonEmptyStringSchema,

    certRef: optionalNonEmptyStringSchema,

    keyRef: optionalNonEmptyStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (value.rejectUnauthorized === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectUnauthorized'],
        message:
          'TLS certificate validation should not be disabled unless this is a local/dev-only Redis instance.',
      });
    }
  });

export const redisRestSchema = z
  .object({
    url: optionalUrlSchema,

    tokenRef: optionalNonEmptyStringSchema,

    tokenHeader: optionalNonEmptyStringSchema,
  })
  .strict();

export const redisConnectionSchema = z
  .object({
    url: optionalNonEmptyStringSchema,

    urlRef: optionalNonEmptyStringSchema,

    host: optionalNonEmptyStringSchema,

    port: z.number().int().positive().max(65535).optional(),

    username: optionalNonEmptyStringSchema,

    usernameRef: optionalNonEmptyStringSchema,

    password: optionalNonEmptyStringSchema,

    passwordRef: optionalNonEmptyStringSchema,

    database: z.number().int().nonnegative().optional(),

    transport: redisTransportSchema.default('tcp'),

    tls: redisTlsSchema.optional(),

    rest: redisRestSchema.optional(),

    binding: optionalNonEmptyStringSchema,

    connectTimeoutMs: z.number().int().positive().optional(),

    commandTimeoutMs: z.number().int().positive().optional(),

    lazyConnect: z.boolean().optional(),

    maxRetries: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.transport === 'memory') {
      return;
    }

    if (value.transport === 'cloudflare-binding') {
      if (!value.binding) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['binding'],
          message:
            'binding is required when Redis transport is cloudflare-binding.',
        });
      }

      return;
    }

    if (value.transport === 'http' || value.transport === 'rest') {
      const hasRestUrl = Boolean(value.rest?.url);
      const hasUrl = Boolean(value.url || value.urlRef);
      const hasToken = Boolean(value.rest?.tokenRef);

      if (!hasRestUrl && !hasUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rest', 'url'],
          message:
            'A REST URL or urlRef is required when Redis transport is http/rest.',
        });
      }

      if (!hasToken && !value.passwordRef && !value.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rest', 'tokenRef'],
          message:
            'A tokenRef or passwordRef is required when Redis transport is http/rest.',
        });
      }

      return;
    }

    const hasUrl = Boolean(value.url || value.urlRef);
    const hasHostAndPort = Boolean(value.host && value.port);

    if (!hasUrl && !hasHostAndPort) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message:
          'A Redis url/urlRef or host+port is required for TCP/TLS Redis connections.',
      });
    }

    if (value.transport === 'tls' && value.tls?.enabled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tls', 'enabled'],
        message: 'tls.enabled should be true when Redis transport is tls.',
      });
    }
  });

export const redisCacheSchema = z
  .object({
    prefix: optionalNonEmptyStringSchema,

    cachePrefix: optionalNonEmptyStringSchema,

    expirationMs: z.number().int().positive().optional(),

    cacheExpirationMs: z.number().int().positive().optional(),

    ttlSeconds: z.number().int().positive().optional(),

    staleReadsEnabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.prefix && value.cachePrefix && value.prefix !== value.cachePrefix) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cachePrefix'],
        message: 'cachePrefix must match prefix when both are provided.',
      });
    }

    if (
      value.expirationMs &&
      value.cacheExpirationMs &&
      value.expirationMs !== value.cacheExpirationMs
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cacheExpirationMs'],
        message:
          'cacheExpirationMs must match expirationMs when both are provided.',
      });
    }

    if (value.expirationMs && value.ttlSeconds) {
      const ttlMs = value.ttlSeconds * 1000;

      if (value.expirationMs !== ttlMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ttlSeconds'],
          message:
            'ttlSeconds must match expirationMs when both are provided.',
        });
      }
    }
  });

export const redisInstanceSchema = z
  .object({
    name: nonEmptyStringSchema,

    enabled: z.boolean().default(true),

    provider: redisProviderSchema.default('redis'),

    role: redisRoleSchema.default('cache'),

    connection: redisConnectionSchema,

    cache: redisCacheSchema.optional(),

    namespace: optionalNonEmptyStringSchema,

    tags: stringArraySchema.optional(),

    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (value.provider === 'disabled') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provider'],
        message: 'An enabled Redis instance cannot use provider "disabled".',
      });
    }

    if (value.provider === 'memory' && value.connection.transport !== 'memory') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['connection', 'transport'],
        message: 'Memory Redis provider should use memory transport.',
      });
    }

    if (
      value.provider === 'upstash' &&
      value.connection.transport !== 'http' &&
      value.connection.transport !== 'rest'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['connection', 'transport'],
        message: 'Upstash Redis should use http or rest transport.',
      });
    }
  });

export const redisSchema = z
  .object({
    enabled: z.boolean().default(false),

    defaultInstance: optionalNonEmptyStringSchema,

    instances: z.record(z.string(), redisInstanceSchema).default({}),

    url: optionalNonEmptyStringSchema,

    host: optionalNonEmptyStringSchema,

    username: optionalNonEmptyStringSchema,

    password: optionalNonEmptyStringSchema,

    port: z.number().int().positive().max(65535).optional(),

    cachePrefix: optionalNonEmptyStringSchema,

    cacheExpirationMs: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    const instanceCount = Object.keys(value.instances).length;
    const hasLegacyConnection = Boolean(value.url || (value.host && value.port));

    if (instanceCount === 0 && !hasLegacyConnection) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['instances'],
        message:
          'At least one Redis instance or a top-level Redis url/host+port is required when Redis is enabled.',
      });
    }

    if (
      value.defaultInstance &&
      instanceCount > 0 &&
      !(value.defaultInstance in value.instances)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultInstance'],
        message: 'defaultInstance must reference a key in instances.',
      });
    }

    for (const [instanceKey, instance] of Object.entries(value.instances)) {
      if (instance.name !== instanceKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['instances', instanceKey, 'name'],
          message:
            'Redis instance name should match its registry key for predictable lookups.',
        });
      }
    }
  });

export type RedisConfigInput = z.input<typeof redisSchema>;

export type RedisConfigOutput = z.output<typeof redisSchema>;

export function parseRedisConfig(input: RedisConfigInput): RedisConfig {
  return redisSchema.parse(input) as RedisConfig;
}

export function safeParseRedisConfig(input: unknown) {
  return redisSchema.safeParse(input);
}
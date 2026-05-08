import { z } from 'zod';

import type { DatabaseConfig } from '../types/database';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const databaseProviderSchema = nonEmptyStringSchema;

export const databaseOrmSchema = nonEmptyStringSchema;

export const databaseRuntimeSchema = nonEmptyStringSchema;

export const databaseSslModeSchema = nonEmptyStringSchema;

export const databaseMigrationModeSchema = nonEmptyStringSchema;

export const databaseConnectionModeSchema = nonEmptyStringSchema;

export const databasePoolSchema = z
  .object({
    min: z.number().int().nonnegative().optional(),

    max: z.number().int().positive().optional(),

    acquireTimeoutMs: z.number().int().positive().optional(),

    idleTimeoutMs: z.number().int().positive().optional(),

    createTimeoutMs: z.number().int().positive().optional(),

    destroyTimeoutMs: z.number().int().positive().optional(),

    propagateCreateError: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.min !== undefined &&
      value.max !== undefined &&
      value.min > value.max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['min'],
        message: 'pool.min must be less than or equal to pool.max.',
      });
    }
  });

export const databaseSslSchema = z
  .object({
    enabled: z.boolean().default(false),

    mode: databaseSslModeSchema.optional(),

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

    if (value.mode === 'disable') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mode'],
        message: 'SSL mode cannot be "disable" when ssl.enabled is true.',
      });
    }

    if (value.rejectUnauthorized === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectUnauthorized'],
        message:
          'TLS certificate validation should not be disabled unless this is local/dev-only.',
      });
    }
  });

export const databaseConnectionSchema = z
  .object({
    url: optionalNonEmptyStringSchema,

    urlRef: optionalNonEmptyStringSchema,

    host: optionalNonEmptyStringSchema,

    port: z.number().int().positive().max(65535).optional(),

    database: optionalNonEmptyStringSchema,

    schema: optionalNonEmptyStringSchema,

    username: optionalNonEmptyStringSchema,

    usernameRef: optionalNonEmptyStringSchema,

    password: optionalNonEmptyStringSchema,

    passwordRef: optionalNonEmptyStringSchema,

    mode: databaseConnectionModeSchema.default('direct'),

    ssl: databaseSslSchema.optional(),

    pool: databasePoolSchema.optional(),

    connectTimeoutMs: z.number().int().positive().optional(),

    statementTimeoutMs: z.number().int().positive().optional(),

    idleInTransactionSessionTimeoutMs: z.number().int().positive().optional(),

    applicationName: optionalNonEmptyStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'binding') {
      return;
    }

    if (value.mode === 'hyperdrive') {
      return;
    }

    if (value.mode === 'serverless' && (value.url || value.urlRef)) {
      return;
    }

    const hasUrl = Boolean(value.url || value.urlRef);
    const hasHostAndDatabase = Boolean(value.host && value.database);

    if (!hasUrl && !hasHostAndDatabase) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message:
          'A database url/urlRef or host+database is required unless connection mode is binding or hyperdrive.',
      });
    }
  });

export const cloudflareHyperdriveDatabaseSchema = z
  .object({
    enabled: z.boolean().default(false),

    binding: nonEmptyStringSchema,

    id: optionalNonEmptyStringSchema,

    originDatabaseUrlRef: optionalNonEmptyStringSchema,

    nodejsCompatRequired: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['id'],
        message: 'Hyperdrive id is required when Hyperdrive is enabled.',
      });
    }

    if (value.nodejsCompatRequired === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodejsCompatRequired'],
        message:
          'nodejsCompatRequired should be true for pg/MikroORM-style database drivers on Cloudflare Workers.',
      });
    }
  });

export const cloudflareD1DatabaseSchema = z
  .object({
    enabled: z.boolean().default(false),

    binding: nonEmptyStringSchema,

    databaseName: optionalNonEmptyStringSchema,

    databaseId: optionalNonEmptyStringSchema,

    secondaryOnly: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.databaseName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['databaseName'],
        message: 'databaseName is required when D1 is enabled.',
      });
    }

    if (!value.databaseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['databaseId'],
        message: 'databaseId is required when D1 is enabled.',
      });
    }
  });

export const mikroOrmDatabaseSchema = z
  .object({
    enabled: z.boolean().default(false),

    type: optionalNonEmptyStringSchema,

    entities: stringArraySchema.optional(),

    entitiesTs: stringArraySchema.optional(),

    migrationsPath: optionalNonEmptyStringSchema,

    migrationsPathTs: optionalNonEmptyStringSchema,

    debug: z.boolean().optional(),

    validateRequired: z.boolean().optional(),

    ensureIndexes: z.boolean().optional(),

    allowGlobalContext: z.boolean().optional(),

    driverOptions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['type'],
        message: 'MikroORM type is required when MikroORM is enabled.',
      });
    }

    const hasEntities = Boolean(value.entities?.length || value.entitiesTs?.length);

    if (!hasEntities) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entities'],
        message:
          'At least one entities or entitiesTs path is required when MikroORM is enabled.',
      });
    }
  });

export const databaseMigrationSchema = z
  .object({
    enabled: z.boolean().default(false),

    mode: databaseMigrationModeSchema.default('disabled'),

    tableName: optionalNonEmptyStringSchema,

    destructiveAllowed: z.boolean().default(false),

    downMigrationsEnabled: z.boolean().optional(),

    requireApproval: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled && value.mode !== 'disabled') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mode'],
        message: 'Migration mode should be "disabled" when migrations are disabled.',
      });
    }

    if (value.destructiveAllowed && value.requireApproval === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requireApproval'],
        message:
          'Destructive migrations should require approval when destructiveAllowed is true.',
      });
    }
  });

export const databaseReadReplicaSchema = z
  .object({
    name: nonEmptyStringSchema,

    enabled: z.boolean().default(true),

    connection: databaseConnectionSchema,

    weight: z.number().positive().optional(),

    region: optionalNonEmptyStringSchema,
  })
  .strict();

export const databaseInstanceSchema = z
  .object({
    name: nonEmptyStringSchema,

    enabled: z.boolean().default(true),

    provider: databaseProviderSchema.default('postgres'),

    runtime: databaseRuntimeSchema.default('node'),

    orm: databaseOrmSchema.default('mikro-orm'),

    connection: databaseConnectionSchema,

    hyperdrive: cloudflareHyperdriveDatabaseSchema.optional(),

    d1: cloudflareD1DatabaseSchema.optional(),

    mikroOrm: mikroOrmDatabaseSchema.optional(),

    migrations: databaseMigrationSchema.optional(),

    readReplicas: z.array(databaseReadReplicaSchema).optional(),

    region: optionalNonEmptyStringSchema,

    requiredSecretRefs: stringArraySchema.optional(),

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
        message: 'An enabled database instance cannot use provider "disabled".',
      });
    }

    if (value.orm === 'mikro-orm' && value.mikroOrm?.enabled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mikroOrm', 'enabled'],
        message:
          'mikroOrm.enabled must be true when database instance orm is "mikro-orm".',
      });
    }

    if (
      value.provider === 'cloudflare-hyperdrive' ||
      value.connection.mode === 'hyperdrive'
    ) {
      if (value.hyperdrive?.enabled !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hyperdrive', 'enabled'],
          message:
            'hyperdrive.enabled must be true when provider or connection mode uses Hyperdrive.',
        });
      }

      if (
        value.runtime !== 'cloudflare-worker' &&
        value.runtime !== 'cloudflare-pages'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['runtime'],
          message:
            'Hyperdrive-backed database instances should use cloudflare-worker or cloudflare-pages runtime.',
        });
      }
    }

    if (value.provider === 'cloudflare-d1') {
      if (value.d1?.enabled !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['d1', 'enabled'],
          message: 'd1.enabled must be true when provider is cloudflare-d1.',
        });
      }

      if (value.orm === 'mikro-orm') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['orm'],
          message:
            'Cloudflare D1 should not be configured as a MikroORM/Postgres primary database.',
        });
      }
    }

    if (
      value.provider === 'postgres' ||
      value.provider === 'postgresql' ||
      value.provider === 'cockroachdb' ||
      value.provider === 'neon'
    ) {
      if (value.connection.mode === 'binding') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['connection', 'mode'],
          message:
            'Postgres-compatible databases should use direct, pooled, serverless, or hyperdrive connection mode.',
        });
      }
    }

    if (value.readReplicas) {
      for (const [replicaIndex, replica] of value.readReplicas.entries()) {
        if (replica.name === value.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['readReplicas', replicaIndex, 'name'],
            message: 'Read replica name must not match the primary instance name.',
          });
        }
      }
    }
  });

export const databaseSchema = z
  .object({
    enabled: z.boolean().default(false),

    defaultInstance: nonEmptyStringSchema.default('primary'),

    instances: z.record(z.string(), databaseInstanceSchema).default({}),

    url: optionalNonEmptyStringSchema,

    urlRef: optionalNonEmptyStringSchema,

    provider: databaseProviderSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (Object.keys(value.instances).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['instances'],
        message:
          'At least one database instance is required when database is enabled.',
      });
    }

    if (!(value.defaultInstance in value.instances)) {
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
            'Database instance name should match its registry key for predictable lookups.',
        });
      }
    }

    const defaultInstance = value.instances[value.defaultInstance];

    if (value.provider && defaultInstance && value.provider !== defaultInstance.provider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provider'],
        message:
          'Top-level provider must match the default database instance provider when provided.',
      });
    }
  });

export type DatabaseConfigInput = z.input<typeof databaseSchema>;

export type DatabaseConfigOutput = z.output<typeof databaseSchema>;

export function parseDatabaseConfig(input: DatabaseConfigInput): DatabaseConfig {
  return databaseSchema.parse(input) as DatabaseConfig;
}

export function safeParseDatabaseConfig(input: unknown) {
  return databaseSchema.safeParse(input);
}
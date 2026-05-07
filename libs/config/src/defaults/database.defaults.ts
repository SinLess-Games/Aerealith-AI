import type { DatabaseConfig } from '../types/database';

export const defaultDatabaseConfig = {
  enabled: false,

  defaultInstance: 'primary',

  instances: {},

  /**
   * Backward-compatible flat fields.
   *
   * New code should use instances.primary.connection instead.
   */
  url: undefined,
  urlRef: undefined,
  provider: 'disabled',
} satisfies DatabaseConfig;

export const defaultCloudflareHyperdriveDatabaseConfig = {
  enabled: true,

  defaultInstance: 'primary',

  instances: {
    primary: {
      name: 'primary',
      enabled: true,

      /**
       * Cloudflare Hyperdrive sits in front of a PostgreSQL-compatible
       * database. The actual upstream can be Neon, Supabase, CockroachDB,
       * self-hosted PostgreSQL, or another compatible provider.
       */
      provider: 'cloudflare-hyperdrive',

      runtime: 'cloudflare-worker',

      orm: 'mikro-orm',

      connection: {
        url: undefined,
        urlRef: undefined,

        host: undefined,
        port: undefined,
        database: undefined,
        schema: 'public',

        username: undefined,
        usernameRef: undefined,

        password: undefined,
        passwordRef: undefined,

        /**
         * Runtime code should use env.HYPERDRIVE.connectionString.
         */
        mode: 'hyperdrive',

        ssl: {
          enabled: true,
          mode: 'require',
          rejectUnauthorized: true,
          caRef: undefined,
          certRef: undefined,
          keyRef: undefined,
        },

        pool: {
          min: 0,
          max: 5,
          acquireTimeoutMs: 10_000,
          idleTimeoutMs: 30_000,
          createTimeoutMs: 10_000,
          destroyTimeoutMs: 5_000,
          propagateCreateError: true,
        },

        connectTimeoutMs: 10_000,
        statementTimeoutMs: 30_000,
        idleInTransactionSessionTimeoutMs: 30_000,
        applicationName: 'helix-ai-cloudflare-worker',
      },

      hyperdrive: {
        enabled: true,
        binding: 'HYPERDRIVE',
        id: undefined,

        /**
         * Secret reference used when creating/updating the Hyperdrive config.
         *
         * Do not store the actual database URL here.
         */
        originDatabaseUrlRef: 'DATABASE_URL',

        nodejsCompatRequired: true,
      },

      d1: undefined,

      mikroOrm: {
        enabled: true,
        type: 'postgresql',

        entities: ['dist/entities/**/*.js'],
        entitiesTs: ['src/entities/**/*.ts'],

        migrationsPath: 'dist/migrations',
        migrationsPathTs: 'src/migrations',

        debug: false,
        validateRequired: true,
        ensureIndexes: false,
        allowGlobalContext: false,

        driverOptions: {},
      },

      migrations: {
        enabled: true,
        mode: 'github-actions',
        tableName: 'mikro_orm_migrations',
        destructiveAllowed: false,
        downMigrationsEnabled: true,
        requireApproval: true,
      },

      readReplicas: [],

      region: undefined,

      requiredSecretRefs: ['DATABASE_URL'],

      tags: ['primary', 'postgres', 'hyperdrive', 'mikro-orm', 'cloudflare'],

      metadata: {
        application: 'helix-ai',
        runtime: 'cloudflare-worker',
        connectionSource: 'env.HYPERDRIVE.connectionString',
      },
    },
  },

  url: undefined,
  urlRef: 'DATABASE_URL',
  provider: 'cloudflare-hyperdrive',
} satisfies DatabaseConfig;

export const defaultPostgresDatabaseConfig = {
  enabled: true,

  defaultInstance: 'primary',

  instances: {
    primary: {
      name: 'primary',
      enabled: true,

      provider: 'postgresql',

      runtime: 'node',

      orm: 'mikro-orm',

      connection: {
        url: undefined,
        urlRef: 'DATABASE_URL',

        host: undefined,
        port: 5432,
        database: undefined,
        schema: 'public',

        username: undefined,
        usernameRef: undefined,

        password: undefined,
        passwordRef: undefined,

        mode: 'pooled',

        ssl: {
          enabled: true,
          mode: 'require',
          rejectUnauthorized: true,
          caRef: undefined,
          certRef: undefined,
          keyRef: undefined,
        },

        pool: {
          min: 0,
          max: 10,
          acquireTimeoutMs: 10_000,
          idleTimeoutMs: 30_000,
          createTimeoutMs: 10_000,
          destroyTimeoutMs: 5_000,
          propagateCreateError: true,
        },

        connectTimeoutMs: 10_000,
        statementTimeoutMs: 30_000,
        idleInTransactionSessionTimeoutMs: 30_000,
        applicationName: 'helix-ai',
      },

      hyperdrive: undefined,

      d1: undefined,

      mikroOrm: {
        enabled: true,
        type: 'postgresql',

        entities: ['dist/entities/**/*.js'],
        entitiesTs: ['src/entities/**/*.ts'],

        migrationsPath: 'dist/migrations',
        migrationsPathTs: 'src/migrations',

        debug: false,
        validateRequired: true,
        ensureIndexes: false,
        allowGlobalContext: false,

        driverOptions: {},
      },

      migrations: {
        enabled: true,
        mode: 'github-actions',
        tableName: 'mikro_orm_migrations',
        destructiveAllowed: false,
        downMigrationsEnabled: true,
        requireApproval: true,
      },

      readReplicas: [],

      region: undefined,

      requiredSecretRefs: ['DATABASE_URL'],

      tags: ['primary', 'postgres', 'mikro-orm', 'node'],

      metadata: {
        application: 'helix-ai',
        runtime: 'node',
      },
    },
  },

  url: undefined,
  urlRef: 'DATABASE_URL',
  provider: 'postgresql',
} satisfies DatabaseConfig;

export const defaultLocalPostgresDatabaseConfig = {
  enabled: true,

  defaultInstance: 'primary',

  instances: {
    primary: {
      name: 'primary',
      enabled: true,

      provider: 'postgresql',

      runtime: 'local',

      orm: 'mikro-orm',

      connection: {
        url: undefined,
        urlRef: 'DATABASE_URL',

        host: 'localhost',
        port: 5432,
        database: 'helix',
        schema: 'public',

        username: 'postgres',
        usernameRef: undefined,

        password: undefined,
        passwordRef: 'DATABASE_PASSWORD',

        mode: 'direct',

        ssl: {
          enabled: false,
          mode: 'disable',
          rejectUnauthorized: true,
          caRef: undefined,
          certRef: undefined,
          keyRef: undefined,
        },

        pool: {
          min: 0,
          max: 5,
          acquireTimeoutMs: 10_000,
          idleTimeoutMs: 30_000,
          createTimeoutMs: 10_000,
          destroyTimeoutMs: 5_000,
          propagateCreateError: true,
        },

        connectTimeoutMs: 10_000,
        statementTimeoutMs: 30_000,
        idleInTransactionSessionTimeoutMs: 30_000,
        applicationName: 'helix-ai-local',
      },

      hyperdrive: undefined,

      d1: undefined,

      mikroOrm: {
        enabled: true,
        type: 'postgresql',

        entities: ['dist/entities/**/*.js'],
        entitiesTs: ['src/entities/**/*.ts'],

        migrationsPath: 'dist/migrations',
        migrationsPathTs: 'src/migrations',

        debug: true,
        validateRequired: true,
        ensureIndexes: false,
        allowGlobalContext: true,

        driverOptions: {},
      },

      migrations: {
        enabled: true,
        mode: 'manual',
        tableName: 'mikro_orm_migrations',
        destructiveAllowed: true,
        downMigrationsEnabled: true,
        requireApproval: true,
      },

      readReplicas: [],

      region: 'local',

      requiredSecretRefs: [],

      tags: ['primary', 'postgres', 'mikro-orm', 'local'],

      metadata: {
        application: 'helix-ai',
        runtime: 'local',
      },
    },
  },

  url: undefined,
  urlRef: 'DATABASE_URL',
  provider: 'postgresql',
} satisfies DatabaseConfig;

export const defaultCloudflareD1DatabaseConfig = {
  enabled: true,

  defaultInstance: 'metadata',

  instances: {
    metadata: {
      name: 'metadata',
      enabled: true,

      /**
       * D1 is useful for lightweight edge metadata, feature metadata,
       * small indexes, and local/dev fallbacks.
       *
       * Do not use this as the primary MikroORM/Postgres database.
       */
      provider: 'cloudflare-d1',

      runtime: 'cloudflare-worker',

      orm: 'raw-sql',

      connection: {
        url: undefined,
        urlRef: undefined,

        host: undefined,
        port: undefined,
        database: undefined,
        schema: undefined,

        username: undefined,
        usernameRef: undefined,

        password: undefined,
        passwordRef: undefined,

        mode: 'binding',

        ssl: undefined,
        pool: undefined,

        connectTimeoutMs: undefined,
        statementTimeoutMs: undefined,
        idleInTransactionSessionTimeoutMs: undefined,
        applicationName: 'helix-ai-d1',
      },

      hyperdrive: undefined,

      d1: {
        enabled: true,
        binding: 'DB',
        databaseName: 'helix-metadata',
        databaseId: undefined,
        secondaryOnly: true,
      },

      mikroOrm: undefined,

      migrations: {
        enabled: false,
        mode: 'disabled',
        tableName: undefined,
        destructiveAllowed: false,
        downMigrationsEnabled: false,
        requireApproval: true,
      },

      readReplicas: [],

      region: undefined,

      requiredSecretRefs: [],

      tags: ['metadata', 'd1', 'cloudflare', 'edge'],

      metadata: {
        application: 'helix-ai',
        runtime: 'cloudflare-worker',
        secondaryOnly: true,
      },
    },
  },

  url: undefined,
  urlRef: undefined,
  provider: 'cloudflare-d1',
} satisfies DatabaseConfig;

export default defaultDatabaseConfig;
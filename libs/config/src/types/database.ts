export type DatabaseProvider =
  | 'postgres'
  | 'postgresql'
  | 'cockroachdb'
  | 'neon'
  | 'cloudflare-hyperdrive'
  | 'cloudflare-d1'
  | 'sqlite'
  | 'libsql'
  | 'mysql'
  | 'mariadb'
  | 'memory'
  | 'disabled'
  | string;

export type DatabaseOrm =
  | 'mikro-orm'
  | 'drizzle'
  | 'prisma'
  | 'kysely'
  | 'raw-sql'
  | 'none'
  | string;

export type DatabaseRuntime =
  | 'cloudflare-worker'
  | 'cloudflare-pages'
  | 'node'
  | 'container'
  | 'kubernetes'
  | 'local'
  | 'test'
  | string;

export type DatabaseSslMode =
  | 'disable'
  | 'allow'
  | 'prefer'
  | 'require'
  | 'verify-ca'
  | 'verify-full'
  | string;

export type DatabaseMigrationMode =
  | 'disabled'
  | 'manual'
  | 'startup'
  | 'ci'
  | 'github-actions'
  | string;

export type DatabaseConnectionMode =
  | 'direct'
  | 'pooled'
  | 'hyperdrive'
  | 'serverless'
  | 'binding'
  | string;

export interface DatabasePoolConfig {
  /**
   * Minimum number of connections in the pool.
   */
  min?: number;

  /**
   * Maximum number of connections in the pool.
   */
  max?: number;

  /**
   * Connection acquire timeout in milliseconds.
   */
  acquireTimeoutMs?: number;

  /**
   * Idle connection timeout in milliseconds.
   */
  idleTimeoutMs?: number;

  /**
   * Connection create timeout in milliseconds.
   */
  createTimeoutMs?: number;

  /**
   * Connection destroy timeout in milliseconds.
   */
  destroyTimeoutMs?: number;

  /**
   * Whether the pool should propagate create errors.
   */
  propagateCreateError?: boolean;
}

export interface DatabaseSslConfig {
  /**
   * Whether SSL/TLS is enabled for database connections.
   */
  enabled: boolean;

  /**
   * Provider-specific SSL mode.
   */
  mode?: DatabaseSslMode;

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

export interface DatabaseConnectionConfig {
  /**
   * Full database connection URL.
   *
   * Example:
   * postgresql://user:password@host:5432/database
   *
   * Prefer urlRef for production secrets.
   */
  url?: string;

  /**
   * Secret/environment reference that contains the database connection URL.
   *
   * Example:
   * DATABASE_URL
   */
  urlRef?: string;

  /**
   * Database host.
   */
  host?: string;

  /**
   * Database port.
   */
  port?: number;

  /**
   * Database name.
   *
   * MikroORM equivalent:
   * dbName
   */
  database?: string;

  /**
   * Optional schema name.
   *
   * PostgreSQL example:
   * public
   */
  schema?: string;

  /**
   * Database username.
   *
   * Prefer usernameRef if this is secret-managed.
   */
  username?: string;

  /**
   * Secret/environment reference that contains the database username.
   */
  usernameRef?: string;

  /**
   * Database password.
   *
   * Avoid committing this value. Prefer passwordRef.
   */
  password?: string;

  /**
   * Secret/environment reference that contains the database password.
   */
  passwordRef?: string;

  /**
   * Connection mode.
   *
   * Examples:
   * direct, pooled, hyperdrive, serverless, binding
   */
  mode: DatabaseConnectionMode;

  /**
   * SSL/TLS connection settings.
   */
  ssl?: DatabaseSslConfig;

  /**
   * Connection pool settings.
   */
  pool?: DatabasePoolConfig;

  /**
   * Connection timeout in milliseconds.
   */
  connectTimeoutMs?: number;

  /**
   * Query/statement timeout in milliseconds.
   */
  statementTimeoutMs?: number;

  /**
   * Idle transaction timeout in milliseconds.
   */
  idleInTransactionSessionTimeoutMs?: number;

  /**
   * Optional application name shown in database connection metadata.
   */
  applicationName?: string;
}

export interface CloudflareHyperdriveDatabaseConfig {
  /**
   * Whether Cloudflare Hyperdrive is enabled for this database.
   */
  enabled: boolean;

  /**
   * Hyperdrive Worker binding name.
   *
   * Example:
   * HYPERDRIVE
   */
  binding: string;

  /**
   * Hyperdrive ID from Wrangler/Cloudflare.
   */
  id?: string;

  /**
   * Secret/environment reference for the upstream direct database URL used to
   * create or manage the Hyperdrive config.
   *
   * Do not store the actual value here.
   */
  originDatabaseUrlRef?: string;

  /**
   * Whether this Worker requires nodejs_compat for database drivers.
   */
  nodejsCompatRequired?: boolean;
}

export interface CloudflareD1DatabaseConfig {
  /**
   * Whether Cloudflare D1 is enabled for this database.
   */
  enabled: boolean;

  /**
   * D1 Worker binding name.
   *
   * Example:
   * DB
   */
  binding: string;

  /**
   * D1 database name.
   */
  databaseName?: string;

  /**
   * D1 database ID.
   */
  databaseId?: string;

  /**
   * Whether this D1 database should be used only for lightweight metadata,
   * cache indexes, or local/dev fallback instead of primary MikroORM storage.
   */
  secondaryOnly?: boolean;
}

export interface MikroOrmDatabaseConfig {
  /**
   * Whether MikroORM is enabled for this database.
   */
  enabled: boolean;

  /**
   * MikroORM driver type.
   *
   * Example:
   * postgresql
   */
  type?: string;

  /**
   * Entity discovery paths or package-level references.
   */
  entities?: string[];

  /**
   * TypeScript entity discovery paths.
   */
  entitiesTs?: string[];

  /**
   * Migrations directory or glob.
   */
  migrationsPath?: string;

  /**
   * TypeScript migrations directory or glob.
   */
  migrationsPathTs?: string;

  /**
   * Whether debug logging is enabled.
   */
  debug?: boolean;

  /**
   * Whether MikroORM should validate required fields.
   */
  validateRequired?: boolean;

  /**
   * Whether MikroORM should ensure database indexes.
   */
  ensureIndexes?: boolean;

  /**
   * Whether MikroORM should allow global context.
   */
  allowGlobalContext?: boolean;

  /**
   * Extra driver options passed through to the underlying database driver.
   *
   * Keep this serializable and non-secret.
   */
  driverOptions?: Record<string, unknown>;
}

export interface DatabaseMigrationConfig {
  /**
   * Whether migrations are enabled.
   */
  enabled: boolean;

  /**
   * When migrations are expected to run.
   */
  mode: DatabaseMigrationMode;

  /**
   * Migration table name.
   */
  tableName?: string;

  /**
   * Whether destructive migrations are allowed.
   *
   * Keep false for production unless explicitly approved.
   */
  destructiveAllowed?: boolean;

  /**
   * Whether down migrations should be generated/kept.
   */
  downMigrationsEnabled?: boolean;

  /**
   * Whether migrations require manual approval in CI/CD.
   */
  requireApproval?: boolean;
}

export interface DatabaseReadReplicaConfig {
  /**
   * Logical replica name.
   */
  name: string;

  /**
   * Whether this replica is enabled.
   */
  enabled: boolean;

  /**
   * Replica connection settings.
   */
  connection: DatabaseConnectionConfig;

  /**
   * Optional read weight for simple weighted routing.
   */
  weight?: number;

  /**
   * Optional region name.
   */
  region?: string;
}

export interface DatabaseInstanceConfig {
  /**
   * Logical database instance name.
   *
   * Examples:
   * primary, analytics, audit, memory
   */
  name: string;

  /**
   * Whether this database instance is enabled.
   */
  enabled: boolean;

  /**
   * Backing provider.
   */
  provider: DatabaseProvider;

  /**
   * Runtime where this database config is consumed.
   */
  runtime: DatabaseRuntime;

  /**
   * ORM/query layer used by this database.
   */
  orm: DatabaseOrm;

  /**
   * Primary connection configuration.
   */
  connection: DatabaseConnectionConfig;

  /**
   * Cloudflare Hyperdrive settings for Postgres-compatible databases.
   */
  hyperdrive?: CloudflareHyperdriveDatabaseConfig;

  /**
   * Cloudflare D1 settings for SQLite-at-the-edge use cases.
   */
  d1?: CloudflareD1DatabaseConfig;

  /**
   * MikroORM-specific settings.
   */
  mikroOrm?: MikroOrmDatabaseConfig;

  /**
   * Migration policy.
   */
  migrations?: DatabaseMigrationConfig;

  /**
   * Optional read replicas.
   */
  readReplicas?: DatabaseReadReplicaConfig[];

  /**
   * Optional region for this database instance.
   */
  region?: string;

  /**
   * Required secret reference names.
   */
  requiredSecretRefs?: string[];

  /**
   * Optional tags for dashboards, ownership, routing, or deployment policies.
   */
  tags?: string[];

  /**
   * Optional provider/runtime-specific metadata.
   */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DatabaseConfig {
  /**
   * Global database enablement.
   */
  enabled: boolean;

  /**
   * Default database instance key.
   */
  defaultInstance: string;

  /**
   * Registry of known database instances.
   */
  instances: Record<string, DatabaseInstanceConfig>;

  /**
   * Backward-compatible flat database URL.
   *
   * Prefer instances.primary.connection.urlRef in new code.
   */
  url?: string;

  /**
   * Backward-compatible secret/environment reference for the primary database URL.
   */
  urlRef?: string;

  /**
   * Backward-compatible primary database provider.
   */
  provider?: DatabaseProvider;
}
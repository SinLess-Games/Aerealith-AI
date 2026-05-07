import type { DatabaseConfig } from '../types/database';

import {
  defaultCloudflareD1DatabaseConfig,
  defaultCloudflareHyperdriveDatabaseConfig,
  defaultDatabaseConfig,
  defaultLocalPostgresDatabaseConfig,
  defaultPostgresDatabaseConfig,
} from '../defaults/database.defaults';
import { databaseSchema } from '../schema/database.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvList,
  isCloudflareEnv,
  resolveAppEnvironment,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type DatabaseConfigProfile =
  | 'default'
  | 'postgres'
  | 'local-postgres'
  | 'cloudflare-hyperdrive'
  | 'cloudflare-d1'
  | 'auto';

export type ResolvedDatabaseConfigProfile = Exclude<
  DatabaseConfigProfile,
  'auto'
>;

export type DatabaseConfigOptions = {
  name?: string;
  profile?: DatabaseConfigProfile;
  defaults?: DatabaseConfig;
};

export function createDatabaseConfig(
  env: EnvRecord = {},
  options: DatabaseConfigOptions = {},
): DatabaseConfig {
  const configName = options.name ?? 'database config';
  const profile = resolveDatabaseConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveDatabaseConfigDefaults(profile);
  const overrides = buildDatabaseConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(databaseSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function buildDatabaseConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootDatabaseOverrides(env, overrides);
  applyPrimaryConnectionOverrides(env, overrides);
  applySslOverrides(env, overrides);
  applyPoolOverrides(env, overrides);
  applyHyperdriveOverrides(env, overrides);
  applyD1Overrides(env, overrides);
  applyMikroOrmOverrides(env, overrides);
  applyMigrationOverrides(env, overrides);
  applyReadReplicaOverrides(env, overrides);
  applyDerivedDatabaseOverrides(env, overrides);

  return overrides;
}

export function resolveDatabaseConfigProfile(
  env: EnvRecord,
  profile: DatabaseConfigProfile = 'auto',
): ResolvedDatabaseConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const explicitProvider = getEnv(env, 'DATABASE_PROVIDER');

  if (explicitProvider === 'cloudflare-hyperdrive') {
    return 'cloudflare-hyperdrive';
  }

  if (explicitProvider === 'cloudflare-d1') {
    return 'cloudflare-d1';
  }

  if (explicitProvider === 'postgresql' || explicitProvider === 'postgres') {
    return 'postgres';
  }

  if (hasD1Signal(env)) {
    return 'cloudflare-d1';
  }

  if (hasHyperdriveSignal(env) || isCloudflareEnv(env)) {
    return 'cloudflare-hyperdrive';
  }

  if (hasPostgresSignal(env)) {
    return 'postgres';
  }

  const environment = resolveAppEnvironment(env);

  if (environment === 'development' || environment === 'test') {
    return 'local-postgres';
  }

  return 'default';
}

export function resolveDatabaseConfigDefaults(
  profile: ResolvedDatabaseConfigProfile,
): DatabaseConfig {
  if (profile === 'cloudflare-hyperdrive') {
    return deepClone(defaultCloudflareHyperdriveDatabaseConfig);
  }

  if (profile === 'cloudflare-d1') {
    return deepClone(defaultCloudflareD1DatabaseConfig);
  }

  if (profile === 'local-postgres') {
    return deepClone(defaultLocalPostgresDatabaseConfig);
  }

  if (profile === 'postgres') {
    return deepClone(defaultPostgresDatabaseConfig);
  }

  return deepClone(defaultDatabaseConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createDatabaseConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const databaseConfig = createDatabaseConfig();

export default databaseConfig;

function applyRootDatabaseOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'DATABASE_ENABLED', 'enabled');
  applyOptionalString(
    env,
    overrides,
    'DATABASE_DEFAULT_INSTANCE',
    'defaultInstance',
  );
  applyOptionalString(env, overrides, 'DATABASE_PROVIDER', 'provider');

  const databaseUrlRef = getEnv(env, 'DATABASE_URL_REF');

  if (databaseUrlRef !== undefined) {
    setDeepValue(overrides, 'urlRef', databaseUrlRef);
  }

  const databaseUrl = getEnv(env, 'DATABASE_URL');

  if (databaseUrl !== undefined) {
    setDeepValue(overrides, 'url', databaseUrl);
  }
}

function applyPrimaryConnectionOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const basePath = 'instances.primary';

  applyOptionalBoolean(env, overrides, 'DATABASE_ENABLED', `${basePath}.enabled`);
  applyOptionalString(env, overrides, 'DATABASE_PROVIDER', `${basePath}.provider`);
  applyOptionalString(env, overrides, 'DATABASE_RUNTIME', `${basePath}.runtime`);
  applyOptionalString(env, overrides, 'DATABASE_ORM', `${basePath}.orm`);

  applyOptionalString(
    env,
    overrides,
    'DATABASE_URL',
    `${basePath}.connection.url`,
  );
  applyOptionalString(
    env,
    overrides,
    'DATABASE_URL_REF',
    `${basePath}.connection.urlRef`,
  );

  applyOptionalString(
    env,
    overrides,
    'DATABASE_HOST',
    `${basePath}.connection.host`,
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_PORT',
    `${basePath}.connection.port`,
  );

  const databaseName =
    getEnv(env, 'DATABASE_NAME') ??
    getEnv(env, 'DATABASE_DB') ??
    getEnv(env, 'POSTGRES_DB');

  if (databaseName !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.database`, databaseName);
  }

  applyOptionalString(
    env,
    overrides,
    'DATABASE_SCHEMA',
    `${basePath}.connection.schema`,
  );

  const username =
    getEnv(env, 'DATABASE_USERNAME') ??
    getEnv(env, 'DATABASE_USER') ??
    getEnv(env, 'POSTGRES_USER');

  if (username !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.username`, username);
  }

  applyOptionalString(
    env,
    overrides,
    'DATABASE_USERNAME_REF',
    `${basePath}.connection.usernameRef`,
  );

  const password = getEnv(env, 'DATABASE_PASSWORD') ?? getEnv(env, 'POSTGRES_PASSWORD');

  if (password !== undefined) {
    setDeepValue(overrides, `${basePath}.connection.password`, password);
  }

  applyOptionalString(
    env,
    overrides,
    'DATABASE_PASSWORD_REF',
    `${basePath}.connection.passwordRef`,
  );

  applyOptionalString(
    env,
    overrides,
    'DATABASE_CONNECTION_MODE',
    `${basePath}.connection.mode`,
  );

  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_CONNECT_TIMEOUT_MS',
    `${basePath}.connection.connectTimeoutMs`,
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_STATEMENT_TIMEOUT_MS',
    `${basePath}.connection.statementTimeoutMs`,
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS',
    `${basePath}.connection.idleInTransactionSessionTimeoutMs`,
  );
  applyOptionalString(
    env,
    overrides,
    'DATABASE_APPLICATION_NAME',
    `${basePath}.connection.applicationName`,
  );

  applyOptionalString(env, overrides, 'DATABASE_REGION', `${basePath}.region`);
  applyOptionalList(
    env,
    overrides,
    'DATABASE_REQUIRED_SECRET_REFS',
    `${basePath}.requiredSecretRefs`,
  );
  applyOptionalList(env, overrides, 'DATABASE_TAGS', `${basePath}.tags`);
}

function applySslOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const basePath = 'instances.primary.connection.ssl';

  applyOptionalBoolean(env, overrides, 'DATABASE_SSL_ENABLED', `${basePath}.enabled`);
  applyOptionalString(env, overrides, 'DATABASE_SSL_MODE', `${basePath}.mode`);
  applyOptionalBoolean(
    env,
    overrides,
    'DATABASE_SSL_REJECT_UNAUTHORIZED',
    `${basePath}.rejectUnauthorized`,
  );
  applyOptionalString(env, overrides, 'DATABASE_SSL_CA_REF', `${basePath}.caRef`);
  applyOptionalString(env, overrides, 'DATABASE_SSL_CERT_REF', `${basePath}.certRef`);
  applyOptionalString(env, overrides, 'DATABASE_SSL_KEY_REF', `${basePath}.keyRef`);
}

function applyPoolOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const basePath = 'instances.primary.connection.pool';

  applyOptionalInteger(env, overrides, 'DATABASE_POOL_MIN', `${basePath}.min`);
  applyOptionalInteger(env, overrides, 'DATABASE_POOL_MAX', `${basePath}.max`);
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_POOL_ACQUIRE_TIMEOUT_MS',
    `${basePath}.acquireTimeoutMs`,
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_POOL_IDLE_TIMEOUT_MS',
    `${basePath}.idleTimeoutMs`,
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_POOL_CREATE_TIMEOUT_MS',
    `${basePath}.createTimeoutMs`,
  );
  applyOptionalInteger(
    env,
    overrides,
    'DATABASE_POOL_DESTROY_TIMEOUT_MS',
    `${basePath}.destroyTimeoutMs`,
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DATABASE_POOL_PROPAGATE_CREATE_ERROR',
    `${basePath}.propagateCreateError`,
  );
}

function applyHyperdriveOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const basePath = 'instances.primary.hyperdrive';

  applyOptionalBoolean(env, overrides, 'HYPERDRIVE_ENABLED', `${basePath}.enabled`);
  applyOptionalString(env, overrides, 'HYPERDRIVE_BINDING', `${basePath}.binding`);
  applyOptionalString(env, overrides, 'HYPERDRIVE_ID', `${basePath}.id`);
  applyOptionalString(
    env,
    overrides,
    'HYPERDRIVE_ORIGIN_DATABASE_URL_REF',
    `${basePath}.originDatabaseUrlRef`,
  );
  applyOptionalBoolean(
    env,
    overrides,
    'HYPERDRIVE_NODEJS_COMPAT_REQUIRED',
    `${basePath}.nodejsCompatRequired`,
  );
}

function applyD1Overrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const basePath = 'instances.metadata.d1';

  applyOptionalBoolean(env, overrides, 'D1_ENABLED', `${basePath}.enabled`);
  applyOptionalString(env, overrides, 'D1_BINDING', `${basePath}.binding`);
  applyOptionalString(env, overrides, 'D1_DATABASE_NAME', `${basePath}.databaseName`);
  applyOptionalString(env, overrides, 'D1_DATABASE_ID', `${basePath}.databaseId`);
  applyOptionalString(
    env,
    overrides,
    'D1_PREVIEW_DATABASE_ID',
    `${basePath}.previewDatabaseId`,
  );
  applyOptionalBoolean(env, overrides, 'D1_SECONDARY_ONLY', `${basePath}.secondaryOnly`);
}

function applyMikroOrmOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const basePath = 'instances.primary.mikroOrm';

  applyOptionalBoolean(env, overrides, 'MIKRO_ORM_ENABLED', `${basePath}.enabled`);
  applyOptionalString(env, overrides, 'MIKRO_ORM_TYPE', `${basePath}.type`);
  applyOptionalList(env, overrides, 'MIKRO_ORM_ENTITIES', `${basePath}.entities`);
  applyOptionalList(
    env,
    overrides,
    'MIKRO_ORM_ENTITIES_TS',
    `${basePath}.entitiesTs`,
  );
  applyOptionalString(
    env,
    overrides,
    'MIKRO_ORM_MIGRATIONS_PATH',
    `${basePath}.migrationsPath`,
  );
  applyOptionalString(
    env,
    overrides,
    'MIKRO_ORM_MIGRATIONS_PATH_TS',
    `${basePath}.migrationsPathTs`,
  );
  applyOptionalBoolean(env, overrides, 'MIKRO_ORM_DEBUG', `${basePath}.debug`);
  applyOptionalBoolean(
    env,
    overrides,
    'MIKRO_ORM_VALIDATE_REQUIRED',
    `${basePath}.validateRequired`,
  );
  applyOptionalBoolean(
    env,
    overrides,
    'MIKRO_ORM_ENSURE_INDEXES',
    `${basePath}.ensureIndexes`,
  );
  applyOptionalBoolean(
    env,
    overrides,
    'MIKRO_ORM_ALLOW_GLOBAL_CONTEXT',
    `${basePath}.allowGlobalContext`,
  );
}

function applyMigrationOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const basePath = 'instances.primary.migrations';

  applyOptionalBoolean(
    env,
    overrides,
    'DATABASE_MIGRATIONS_ENABLED',
    `${basePath}.enabled`,
  );
  applyOptionalString(env, overrides, 'DATABASE_MIGRATION_MODE', `${basePath}.mode`);
  applyOptionalString(
    env,
    overrides,
    'DATABASE_MIGRATIONS_TABLE_NAME',
    `${basePath}.tableName`,
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DATABASE_DESTRUCTIVE_MIGRATIONS_ALLOWED',
    `${basePath}.destructiveAllowed`,
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DATABASE_DOWN_MIGRATIONS_ENABLED',
    `${basePath}.downMigrationsEnabled`,
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DATABASE_MIGRATIONS_REQUIRE_APPROVAL',
    `${basePath}.requireApproval`,
  );
}

function applyReadReplicaOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const replicaNames = getEnvList(env, 'DATABASE_READ_REPLICAS');

  if (replicaNames.length === 0) {
    return;
  }

  const replicas = replicaNames.map((replicaName) => {
    const normalizedName = normalizeConfigKey(replicaName);
    const envPrefix = `DATABASE_REPLICA_${normalizedName.toUpperCase()}`;

    return {
      name: normalizedName,
      enabled: getEnvBoolean(env, `${envPrefix}_ENABLED`) ?? true,
      connection: {
        url: getEnv(env, `${envPrefix}_URL`),
        urlRef: getEnv(env, `${envPrefix}_URL_REF`),
        host: getEnv(env, `${envPrefix}_HOST`),
        port: getEnvInteger(env, `${envPrefix}_PORT`),
        database: getEnv(env, `${envPrefix}_DATABASE`),
        username: getEnv(env, `${envPrefix}_USERNAME`),
        usernameRef: getEnv(env, `${envPrefix}_USERNAME_REF`),
        passwordRef: getEnv(env, `${envPrefix}_PASSWORD_REF`),
        mode: getEnv(env, `${envPrefix}_CONNECTION_MODE`) ?? 'read-replica',
      },
      region: getEnv(env, `${envPrefix}_REGION`),
    };
  });

  setDeepValue(overrides, 'instances.primary.readReplicas', replicas);
}

function applyDerivedDatabaseOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const databaseUrlRef = getEnv(env, 'DATABASE_URL_REF') ?? 'DATABASE_URL';

  if (hasHyperdriveSignal(env) || isCloudflareEnv(env)) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'provider', 'cloudflare-hyperdrive');
    setDeepValue(overrides, 'urlRef', databaseUrlRef);

    setDeepValue(overrides, 'instances.primary.enabled', true);
    setDeepValue(overrides, 'instances.primary.provider', 'cloudflare-hyperdrive');
    setDeepValue(overrides, 'instances.primary.runtime', 'cloudflare-worker');
    setDeepValue(overrides, 'instances.primary.orm', 'mikro-orm');
    setDeepValue(overrides, 'instances.primary.connection.mode', 'hyperdrive');
    setDeepValue(overrides, 'instances.primary.connection.urlRef', undefined);
    setDeepValue(overrides, 'instances.primary.hyperdrive.enabled', true);
    setDeepValue(
      overrides,
      'instances.primary.hyperdrive.binding',
      getEnv(env, 'HYPERDRIVE_BINDING') ?? 'HYPERDRIVE',
    );
    setDeepValue(
      overrides,
      'instances.primary.hyperdrive.originDatabaseUrlRef',
      getEnv(env, 'HYPERDRIVE_ORIGIN_DATABASE_URL_REF') ?? databaseUrlRef,
    );
    setDeepValue(
      overrides,
      'instances.primary.hyperdrive.nodejsCompatRequired',
      true,
    );
    setDeepValue(overrides, 'instances.primary.requiredSecretRefs', [
      databaseUrlRef,
    ]);
  }

  if (hasD1Signal(env)) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'provider', 'cloudflare-d1');
    setDeepValue(overrides, 'defaultInstance', 'metadata');

    setDeepValue(overrides, 'instances.metadata.enabled', true);
    setDeepValue(overrides, 'instances.metadata.provider', 'cloudflare-d1');
    setDeepValue(overrides, 'instances.metadata.runtime', 'cloudflare-worker');
    setDeepValue(overrides, 'instances.metadata.orm', 'raw-sql');
    setDeepValue(overrides, 'instances.metadata.connection.mode', 'binding');
    setDeepValue(overrides, 'instances.metadata.d1.enabled', true);
    setDeepValue(
      overrides,
      'instances.metadata.d1.binding',
      getEnv(env, 'D1_BINDING') ?? 'DB',
    );
  }

  if (hasPostgresSignal(env) && !hasHyperdriveSignal(env)) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'provider', 'postgresql');
    setDeepValue(overrides, 'urlRef', databaseUrlRef);

    setDeepValue(overrides, 'instances.primary.enabled', true);
    setDeepValue(overrides, 'instances.primary.provider', 'postgresql');
    setDeepValue(overrides, 'instances.primary.orm', 'mikro-orm');
    setDeepValue(overrides, 'instances.primary.connection.urlRef', databaseUrlRef);
    setDeepValue(overrides, 'instances.primary.requiredSecretRefs', [
      databaseUrlRef,
    ]);
  }

  if (getEnvBoolean(env, 'DATABASE_ENABLED') === undefined) {
    if (
      hasPostgresSignal(env) ||
      hasHyperdriveSignal(env) ||
      hasD1Signal(env) ||
      getEnv(env, 'DATABASE_PROVIDER')
    ) {
      setDeepValue(overrides, 'enabled', true);
    }
  }
}

function hasPostgresSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'DATABASE_URL') ||
      getEnv(env, 'DATABASE_URL_REF') ||
      getEnv(env, 'DATABASE_HOST') ||
      getEnv(env, 'DATABASE_NAME') ||
      getEnv(env, 'DATABASE_DB') ||
      getEnv(env, 'POSTGRES_DB'),
  );
}

function hasHyperdriveSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'HYPERDRIVE_BINDING') ||
      getEnv(env, 'HYPERDRIVE_ID') ||
      getEnv(env, 'HYPERDRIVE_ORIGIN_DATABASE_URL_REF') ||
      getEnv(env, 'DATABASE_PROVIDER') === 'cloudflare-hyperdrive',
  );
}

function hasD1Signal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'D1_BINDING') ||
      getEnv(env, 'D1_DATABASE_NAME') ||
      getEnv(env, 'D1_DATABASE_ID') ||
      getEnv(env, 'DATABASE_PROVIDER') === 'cloudflare-d1',
  );
}

function applyOptionalString(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalBoolean(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvBoolean(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalInteger(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvInteger(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalList(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvList(env, envKey);

  if (value.length > 0) {
    setDeepValue(target, path, value);
  }
}

function normalizeConfigKey(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}
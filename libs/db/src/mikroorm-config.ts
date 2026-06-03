// libs/db/src/mikroorm-config.ts

import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import { appConfig } from "@helix-ai/config";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as entities from "./entities/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");

type ConfigRecord = Record<string, unknown>;

type MikroOrmConfigInput = Parameters<typeof defineConfig>[0];

type MikroOrmEntities = NonNullable<MikroOrmConfigInput["entities"]>;

type DriverConnectionOptions = {
  connectionString?: string;
  ssl?: {
    rejectUnauthorized: boolean;
  };
  application_name?: string;
  connectionTimeoutMillis?: number;
  statement_timeout?: number;
  idle_in_transaction_session_timeout?: number;
};

type PoolOptions = {
  min?: number;
  max?: number;
  acquireTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  createTimeoutMillis?: number;
  destroyTimeoutMillis?: number;
  propagateCreateError?: boolean;
};

const discoveredEntities = Object.values(entities).filter(
  (entity) => typeof entity === "function",
) as MikroOrmEntities;

const isProduction = process.env.NODE_ENV === "production";

function readConfigValue(path: string[]): unknown {
  let current: unknown = appConfig;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as ConfigRecord)[key];
  }

  return current;
}

function readConfigString(path: string[]): string | undefined {
  const value = readConfigValue(path);

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readConfigNumber(path: string[]): number | undefined {
  const value = readConfigValue(path);

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readConfigBoolean(path: string[]): boolean | undefined {
  const value = readConfigValue(path);

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function readEnvString(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function readEnvNumber(...keys: string[]): number | undefined {
  const value = readEnvString(...keys);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function readEnvBoolean(...keys: string[]): boolean | undefined {
  const value = readEnvString(...keys);

  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function readReferencedEnvValue(ref?: string): string | undefined {
  if (!ref) {
    return undefined;
  }

  return readEnvString(ref);
}

function hasUrlProtocol(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function buildDatabaseUrlFromParts(
  rawUrl: string | undefined,
  username: string | undefined,
  password: string | undefined,
): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  if (hasUrlProtocol(rawUrl)) {
    return rawUrl;
  }

  if (!username || !password) {
    throw new Error(
      [
        "POSTGRES_URL is missing a protocol and credentials.",
        "Either set POSTGRES_URL to a full postgresql:// URL,",
        "or set POSTGRES_URL to host/database/query plus POSTGRES_USER and POSTGRES_PASSWORD.",
      ].join(" "),
    );
  }

  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(
    password,
  )}@${rawUrl}`;
}

function readSslModeFromDatabaseUrl(
  databaseUrl: string | undefined,
): string | undefined {
  if (!databaseUrl) {
    return undefined;
  }

  try {
    return new URL(databaseUrl).searchParams.get("sslmode") ?? undefined;
  } catch {
    return undefined;
  }
}

function databaseUrlMatchesHost(
  databaseUrl: string | undefined,
  expectedHost: string,
): boolean {
  if (!databaseUrl || !expectedHost) {
    return false;
  }

  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();
    const expected = expectedHost.toLowerCase();
    return hostname === expected || hostname.endsWith(`.${expected}`);
  } catch {
    return false;
  }
}

function resolvePath(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  return isAbsolute(value) ? value : join(packageRoot, value);
}

function pruneUndefined<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>;
}

const primaryConnectionPath = [
  "database",
  "instances",
  "primary",
  "connection",
];

const primaryMikroOrmPath = ["database", "instances", "primary", "mikroOrm"];

const primaryMigrationsPath = [
  "database",
  "instances",
  "primary",
  "migrations",
];

const connectionUrlRef =
  readEnvString("DATABASE_URL_REF") ??
  readConfigString([...primaryConnectionPath, "urlRef"]) ??
  readConfigString(["database", "urlRef"]);

const rawDatabaseUrl =
  readEnvString("DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL") ??
  readReferencedEnvValue(connectionUrlRef) ??
  readConfigString([...primaryConnectionPath, "url"]) ??
  readConfigString(["database", "url"]) ??
  readConfigString(["postgres", "url"]) ??
  readConfigString(["supabase", "databaseUrl"]) ??
  readConfigString(["supabase", "dbUrl"]);

const databaseHost =
  readEnvString("DATABASE_HOST", "POSTGRES_HOST") ??
  readConfigString([...primaryConnectionPath, "host"]);

const databasePort =
  readEnvNumber("DATABASE_PORT", "POSTGRES_PORT") ??
  readConfigNumber([...primaryConnectionPath, "port"]) ??
  5432;

const databaseName =
  readEnvString("DATABASE_NAME", "DATABASE_DB", "POSTGRES_DB") ??
  readConfigString([...primaryConnectionPath, "database"]) ??
  readConfigString(["database", "name"]);

const databaseUser =
  readEnvString(
    "DATABASE_USERNAME",
    "DATABASE_USER",
    "POSTGRES_USERNAME",
    "POSTGRES_USER",
  ) ??
  readReferencedEnvValue(
    readConfigString([...primaryConnectionPath, "usernameRef"]),
  ) ??
  readConfigString([...primaryConnectionPath, "username"]) ??
  readConfigString([...primaryConnectionPath, "user"]);

const databasePassword =
  readEnvString("DATABASE_PASSWORD", "POSTGRES_PASSWORD") ??
  readReferencedEnvValue(
    readConfigString([...primaryConnectionPath, "passwordRef"]),
  ) ??
  readConfigString([...primaryConnectionPath, "password"]);

const databaseUrl = buildDatabaseUrlFromParts(
  rawDatabaseUrl,
  databaseUser,
  databasePassword,
);

const databaseSchema =
  readEnvString("DATABASE_SCHEMA") ??
  readConfigString([...primaryConnectionPath, "schema"]);

export const databaseConnectionConfigured = Boolean(
  databaseUrl || (databaseHost && databaseName && databaseUser),
);

const applicationName =
  readEnvString("DATABASE_APPLICATION_NAME") ??
  readConfigString([...primaryConnectionPath, "applicationName"]) ??
  "helix-ai";

const connectTimeoutMs =
  readEnvNumber("DATABASE_CONNECT_TIMEOUT_MS") ??
  readConfigNumber([...primaryConnectionPath, "connectTimeoutMs"]);

const statementTimeoutMs =
  readEnvNumber("DATABASE_STATEMENT_TIMEOUT_MS") ??
  readConfigNumber([...primaryConnectionPath, "statementTimeoutMs"]);

const idleInTransactionSessionTimeoutMs =
  readEnvNumber("DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS") ??
  readConfigNumber([
    ...primaryConnectionPath,
    "idleInTransactionSessionTimeoutMs",
  ]);

const sslMode =
  readEnvString("DATABASE_SSL_MODE", "POSTGRES_SSL_MODE") ??
  readConfigString([...primaryConnectionPath, "ssl", "mode"]) ??
  readSslModeFromDatabaseUrl(databaseUrl);

const explicitSslEnabled =
  readEnvBoolean(
    "DATABASE_SSL_ENABLED",
    "DATABASE_SSL",
    "POSTGRES_SSL",
    "SUPABASE_SSL",
  ) ?? readConfigBoolean([...primaryConnectionPath, "ssl", "enabled"]);

const inferredSslEnabled =
  ["require", "verify-ca", "verify-full"].includes(sslMode ?? "") ||
  databaseUrlMatchesHost(databaseUrl, "supabase.com") ||
  databaseUrlMatchesHost(databaseUrl, "cockroachlabs.cloud");

const sslEnabled = explicitSslEnabled ?? inferredSslEnabled;

const explicitRejectUnauthorized =
  readEnvBoolean("DATABASE_SSL_REJECT_UNAUTHORIZED") ??
  readConfigBoolean([...primaryConnectionPath, "ssl", "rejectUnauthorized"]);

const inferredRejectUnauthorized = ["verify-ca", "verify-full"].includes(
  sslMode ?? "",
);

const rejectUnauthorized =
  explicitRejectUnauthorized ?? inferredRejectUnauthorized;

const knexVersion =
  readEnvString("DATABASE_KNEX_VERSION") ??
  readConfigString([...primaryMikroOrmPath, "knexVersion"]) ??
  (databaseUrlMatchesHost(databaseUrl, "cockroachlabs.cloud")
    ? "16.0"
    : undefined);

const pool = pruneUndefined<PoolOptions>({
  min:
    readEnvNumber("DATABASE_POOL_MIN") ??
    readConfigNumber([...primaryConnectionPath, "pool", "min"]),
  max:
    readEnvNumber("DATABASE_POOL_MAX") ??
    readConfigNumber([...primaryConnectionPath, "pool", "max"]),
  acquireTimeoutMillis:
    readEnvNumber("DATABASE_POOL_ACQUIRE_TIMEOUT_MS") ??
    readConfigNumber([...primaryConnectionPath, "pool", "acquireTimeoutMs"]),
  idleTimeoutMillis:
    readEnvNumber("DATABASE_POOL_IDLE_TIMEOUT_MS") ??
    readConfigNumber([...primaryConnectionPath, "pool", "idleTimeoutMs"]),
  createTimeoutMillis:
    readEnvNumber("DATABASE_POOL_CREATE_TIMEOUT_MS") ??
    readConfigNumber([...primaryConnectionPath, "pool", "createTimeoutMs"]),
  destroyTimeoutMillis:
    readEnvNumber("DATABASE_POOL_DESTROY_TIMEOUT_MS") ??
    readConfigNumber([...primaryConnectionPath, "pool", "destroyTimeoutMs"]),
  propagateCreateError:
    readEnvBoolean("DATABASE_POOL_PROPAGATE_CREATE_ERROR") ??
    readConfigBoolean([
      ...primaryConnectionPath,
      "pool",
      "propagateCreateError",
    ]),
});

const hasPoolOptions = Object.keys(pool).length > 0;

const driverConnectionOptions = pruneUndefined<DriverConnectionOptions>({
  connectionString: databaseUrl,
  ssl: sslEnabled
    ? {
        rejectUnauthorized,
      }
    : undefined,
  application_name: applicationName,
  connectionTimeoutMillis: connectTimeoutMs,
  statement_timeout: statementTimeoutMs,
  idle_in_transaction_session_timeout: idleInTransactionSessionTimeoutMs,
});

const hasDriverConnectionOptions =
  Object.keys(driverConnectionOptions).length > 0;

const driverOptions = pruneUndefined({
  version: knexVersion,
  connection: hasDriverConnectionOptions ? driverConnectionOptions : undefined,
});

const hasDriverOptions = Object.keys(driverOptions).length > 0;

const migrationsPath = resolvePath(
  readEnvString("MIKRO_ORM_MIGRATIONS_PATH") ??
    readConfigString([...primaryMikroOrmPath, "migrationsPath"]),
  join(__dirname, "migrations"),
);

const migrationsPathTs = resolvePath(
  readEnvString("MIKRO_ORM_MIGRATIONS_PATH_TS") ??
    readConfigString([...primaryMikroOrmPath, "migrationsPathTs"]),
  join(__dirname, "migrations"),
);

const migrationsTableName =
  readEnvString("DATABASE_MIGRATIONS_TABLE_NAME") ??
  readConfigString([...primaryMigrationsPath, "tableName"]) ??
  "mikroorm_migrations";

const mikroOrmDebug =
  readEnvBoolean("MIKRO_ORM_DEBUG") ??
  readConfigBoolean([...primaryMikroOrmPath, "debug"]) ??
  !isProduction;

const allowGlobalContext =
  readEnvBoolean("MIKRO_ORM_ALLOW_GLOBAL_CONTEXT") ??
  readConfigBoolean([...primaryMikroOrmPath, "allowGlobalContext"]) ??
  false;

const fallbackDatabaseUrl = "postgresql://helix:helix@127.0.0.1:5432/helix";

export default defineConfig({
  entities: discoveredEntities,

  extensions: [Migrator],

  dynamicImportProvider: (id) => import(id),

  ...(databaseUrl || !databaseConnectionConfigured
    ? {
        clientUrl: databaseUrl ?? fallbackDatabaseUrl,
      }
    : {
        host: databaseHost,
        port: databasePort,
        dbName: databaseName,
        user: databaseUser,
        password: databasePassword,
      }),

  ...(databaseSchema
    ? {
        schema: databaseSchema,
      }
    : {}),

  ...(hasPoolOptions
    ? {
        pool,
      }
    : {}),

  ...(hasDriverOptions
    ? {
        driverOptions,
      }
    : {}),

  schemaGenerator: {
    disableForeignKeys: false,
    createForeignKeyConstraints: true,
  },

  allowGlobalContext,

  debug: mikroOrmDebug,

  migrations: {
    path: migrationsPath,
    pathTs: migrationsPathTs,
    tableName: migrationsTableName,
    emit: "ts",
  },

  seeder: {
    path: join(__dirname, "seeders"),
    pathTs: join(__dirname, "seeders"),
    defaultSeeder: "DatabaseSeeder",
  },

  discovery: {
    warnWhenNoEntities: true,
  },
});

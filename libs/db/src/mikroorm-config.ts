// libs/db/src/mikroorm-config.ts

import { defineConfig } from '@mikro-orm/postgresql';
import { appConfig } from '@helix-ai/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as entities from './entities/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type ConfigRecord = Record<string, unknown>;

function readConfigString(path: string[]): string | undefined {
  let current: unknown = appConfig;

  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    current = (current as ConfigRecord)[key];
  }

  return typeof current === 'string' && current.trim().length > 0
    ? current
    : undefined;
}

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  readConfigString(['database', 'url']) ||
  readConfigString(['postgres', 'url']) ||
  readConfigString(['supabase', 'databaseUrl']) ||
  readConfigString(['supabase', 'dbUrl']) ||
  readConfigString(['supabase', 'url']);

if (!databaseUrl) {
  throw new Error(
    'MikroORM database URL is missing. Set DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL, or configure appConfig.database.url.',
  );
}

const isProduction = process.env.NODE_ENV === 'production';

const sslEnabled =
  process.env.DATABASE_SSL === 'true' ||
  process.env.POSTGRES_SSL === 'true' ||
  process.env.SUPABASE_SSL === 'true' ||
  databaseUrl.includes('supabase.com');

const rejectUnauthorized =
  process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';

export default defineConfig({
  entities: Object.values(entities),

  clientUrl: databaseUrl,

  driverOptions: sslEnabled
    ? {
        connection: {
          ssl: {
            rejectUnauthorized,
          },
        },
      }
    : undefined,

  schemaGenerator: {
    disableForeignKeys: false,
    createForeignKeyConstraints: true,
  },

  debug: !isProduction,

  migrations: {
    path: join(__dirname, 'migrations'),
    pathTs: join(__dirname, 'migrations'),
    tableName: 'mikroorm_migrations',
    emit: 'ts',
  },

  seeder: {
    path: join(__dirname, 'seeders'),
    pathTs: join(__dirname, 'seeders'),
    defaultSeeder: 'DatabaseSeeder',
  },

  discovery: {
    warnWhenNoEntities: true,
  },
});
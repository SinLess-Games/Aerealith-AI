// libs/db/src/index.ts

/**
 * Helix Database Library
 *
 * Central export surface for MikroORM configuration, entities, and utilities.
 *
 * Usage:
 * import { getOrm, initOrm, ormConfig, entities } from '@helix-ai/db';
 * import { User, UserProfile, Waitlist } from '@helix-ai/db';
 */

import { MikroORM } from '@mikro-orm/core';
import type {
  EntityManager,
  EntityName,
  Opt,
  RequiredEntityData,
} from '@mikro-orm/core';
import type { PostgreSqlDriver } from '@mikro-orm/postgresql';

import ormConfig, {
  databaseConnectionConfigured,
} from './mikroorm-config.js';

export { ormConfig };

export * as entities from './entities/index.js';
export * from './entities/index.js';

export * from './entity.base.js';

export type {
  EntityManager,
  EntityName,
  Opt,
  PostgreSqlDriver,
  RequiredEntityData,
};

type HelixGlobal = typeof globalThis & {
  __helixOrm?: Promise<MikroORM<PostgreSqlDriver>>;
};

const helixGlobal = globalThis as HelixGlobal;

/**
 * Initialize and return a new MikroORM instance.
 *
 * Use this for scripts, migrations, CLIs, tests, and one-off processes.
 *
 * Example:
 * const orm = await initOrm();
 * const em = orm.em.fork();
 */
export async function initOrm(): Promise<MikroORM<PostgreSqlDriver>> {
  if (!databaseConnectionConfigured) {
    throw new Error(
      [
        'MikroORM database connection is missing.',
        'Set DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL.',
        'Alternatively set DATABASE_HOST, DATABASE_NAME, DATABASE_USER, and DATABASE_PASSWORD.',
      ].join(' '),
    );
  }

  return MikroORM.init<PostgreSqlDriver>(ormConfig);
}

/**
 * Return a cached MikroORM instance.
 *
 * Use this in long-running app processes like Next.js route handlers so hot reloads
 * and repeated requests do not create unnecessary database connections.
 *
 * Example:
 * const orm = await getOrm();
 * const em = orm.em.fork();
 */
export function getOrm(): Promise<MikroORM<PostgreSqlDriver>> {
  helixGlobal.__helixOrm ??= initOrm();

  return helixGlobal.__helixOrm;
}

/**
 * Fork a request-safe EntityManager from an existing ORM instance.
 */
export function forkEntityManager(
  orm: MikroORM<PostgreSqlDriver>,
): EntityManager<PostgreSqlDriver> {
  return orm.em.fork();
}

/**
 * Get a request-safe EntityManager from the cached ORM instance.
 *
 * Use this in API routes, server actions, and request-scoped handlers.
 *
 * Example:
 * const em = await getEntityManager();
 */
export async function getEntityManager(): Promise<EntityManager<PostgreSqlDriver>> {
  const orm = await getOrm();

  return forkEntityManager(orm);
}

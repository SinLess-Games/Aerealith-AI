// libs/db/src/index.ts

/**
 * Helix Database Library
 *
 * Central export surface for MikroORM configuration, entities, and utilities.
 *
 * Usage:
 * import { initOrm, ormConfig, entities } from '@helix-ai/db';
 * import { User, UserProfile } from '@helix-ai/db';
 */

import { MikroORM } from '@mikro-orm/core';
import type {
  EntityManager,
  EntityName,
  Opt,
  RequiredEntityData,
} from '@mikro-orm/core';
import type { PostgreSqlDriver } from '@mikro-orm/postgresql';

import ormConfig from './mikroorm-config.js';

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

/**
 * Initialize and return a ready MikroORM instance.
 *
 * Example:
 * const orm = await initOrm();
 * const em = orm.em.fork();
 */
export async function initOrm(): Promise<MikroORM<PostgreSqlDriver>> {
  return MikroORM.init<PostgreSqlDriver>(ormConfig);
}

/**
 * Fork a request-safe EntityManager from an existing ORM instance.
 */
export function forkEntityManager(
  orm: MikroORM<PostgreSqlDriver>,
): EntityManager<PostgreSqlDriver> {
  return orm.em.fork();
}
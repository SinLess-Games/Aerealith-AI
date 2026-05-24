// libs/db/src/index.ts

/**
 * Helix Database Library
 *
 * Central export surface for MikroORM configuration, entities, repositories,
 * and utilities.
 *
 * Usage:
 * import { getOrm, initOrm, ormConfig, entities, repositories } from '@aerealith-ai/db';
 * import { User, Profile, Settings, Waitlist } from '@aerealith-ai/db';
 * import { UserRepository, WaitlistRepository } from '@aerealith-ai/db';
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

export * as repositories from './repositories/index.js';
export * from './repositories/index.js';

export * from './enums/index.js';
export * from './entity.base.js';
export type {
  AccessibilityUserSettings,
  AccountUserSettings,
  AiUserSettings,
  AppearanceUserSettings,
  CommunicationUserSettings,
  ContentUserSettings,
  DeveloperUserSettings,
  IntegrationUserSettings,
  LocalizationUserSettings,
  MemoryUserSettings,
  NotificationUserSettings,
  PrivacyUserSettings,
  SecurityUserSettings,
  UserSettingsMetadata,
  UserSettingsPatch,
} from './types/user-settings/index.js';

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

type MikroOrmRuntimeWarmable = {
  getPkGetter(meta: unknown): unknown;
  getPkGetterConverted(meta: unknown): unknown;
  getPkSerializer(meta: unknown): unknown;
  getSnapshotGenerator(entityName: string): unknown;
  getResultMapper(entityName: string): unknown;
  getEntityComparator(entityName: string): unknown;
};

type MikroOrmHydratorWarmable = {
  getEntityHydrator(
    meta: unknown,
    type: 'full' | 'reference',
    normalizeAccessors?: boolean,
  ): unknown;
};

type MikroOrmMetadataWarmable = {
  getAll(): Record<string, { className: string }>;
};

type MikroOrmWarmable = {
  metadata: MikroOrmMetadataWarmable;
  config: {
    getComparator(metadata: unknown): unknown;
    getHydrator(metadata: unknown): unknown;
  };
  driver?: {
    comparator?: MikroOrmRuntimeWarmable;
  };
};

function warmMikroOrmComparator(
  comparator: MikroOrmRuntimeWarmable,
  metadata: MikroOrmMetadataWarmable,
): void {
  for (const meta of Object.values(metadata.getAll())) {
    comparator.getPkGetter(meta);
    comparator.getPkGetterConverted(meta);
    comparator.getPkSerializer(meta);
    comparator.getSnapshotGenerator(meta.className);
    comparator.getResultMapper(meta.className);
    comparator.getEntityComparator(meta.className);
  }
}

function warmMikroOrmHydrator(
  hydrator: MikroOrmHydratorWarmable,
  metadata: MikroOrmMetadataWarmable,
): void {
  for (const meta of Object.values(metadata.getAll())) {
    hydrator.getEntityHydrator(meta, 'full', false);
    hydrator.getEntityHydrator(meta, 'full', true);
    hydrator.getEntityHydrator(meta, 'reference', false);
    hydrator.getEntityHydrator(meta, 'reference', true);
  }
}

function warmMikroOrmRuntime(orm: MikroORM<PostgreSqlDriver>): void {
  const warmableOrm = orm as unknown as MikroOrmWarmable;
  const metadata = warmableOrm.metadata;
  const configComparator = warmableOrm.config.getComparator(
    metadata,
  ) as unknown as MikroOrmRuntimeWarmable;
  const hydrator = warmableOrm.config.getHydrator(
    metadata,
  ) as unknown as MikroOrmHydratorWarmable;

  warmMikroOrmComparator(configComparator, metadata);
  warmMikroOrmHydrator(hydrator, metadata);

  if (warmableOrm.driver?.comparator !== undefined) {
    warmMikroOrmComparator(warmableOrm.driver.comparator, metadata);
  }
}

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

  const orm = await MikroORM.init<PostgreSqlDriver>(ormConfig);

  warmMikroOrmRuntime(orm);

  return orm;
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
  await orm.reconnect();

  return forkEntityManager(orm);
}

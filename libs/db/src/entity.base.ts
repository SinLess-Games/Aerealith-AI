// libs/db/src/entity.base.ts

import {
  BeforeCreate,
  BeforeUpdate,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { appConfig } from '@aerealith-ai/config';
import { randomUUID } from 'node:crypto';
import { validate as isUuid, v5 as uuidv5 } from 'uuid';

type ConfigRecord = Record<string, unknown>;

const DEFAULT_HELIX_UUID_NAMESPACE = '8d38c9f1-6b1d-5c3f-9e03-8a23dc8a1b42';

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

function resolveUuidNamespace(): string {
  const namespace =
    readConfigString(['security', 'uuid_namespace']) ??
    readConfigString(['security', 'uuidNamespace']) ??
    DEFAULT_HELIX_UUID_NAMESPACE;

  if (!isUuid(namespace)) {
    throw new Error(
      `Invalid Helix UUID namespace configured: "${namespace}". Expected a valid UUID string.`,
    );
  }

  return namespace;
}

/**
 * Namespace UUID used for deterministic UUIDv5 generation.
 *
 * Preferred config keys:
 * - appConfig.security.uuid_namespace
 * - appConfig.security.uuidNamespace
 */
export const HELIX_UUID_NAMESPACE = resolveUuidNamespace();

export abstract class BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    defaultRaw: 'CURRENT_TIMESTAMP',
  })
  createdAt: Date = new Date();

  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    defaultRaw: 'CURRENT_TIMESTAMP',
    onUpdate: () => new Date(),
  })
  updatedAt: Date = new Date();

  /**
   * Override this in child entities when a stable deterministic UUIDv5 is needed.
   *
   * Example:
   * protected getDeterministicIdSeed(): string | undefined {
   *   return this.email;
   * }
   */
  protected getDeterministicIdSeed(): string | undefined {
    return undefined;
  }

  /**
   * Generates an ID before insert.
   *
   * - Uses UUIDv5 when a child entity provides a deterministic seed.
   * - Uses random UUIDv4 when no deterministic seed is available.
   */
  @BeforeCreate()
  protected generateId(): void {
    if (this.id) {
      return;
    }

    const deterministicSeed = this.getDeterministicIdSeed();

    this.id = deterministicSeed
      ? uuidv5(`${this.constructor.name}:${deterministicSeed}`, HELIX_UUID_NAMESPACE)
      : randomUUID();
  }

  /** Automatically refresh updatedAt before updates. */
  @BeforeUpdate()
  protected touchUpdatedAt(): void {
    this.updatedAt = new Date();
  }
}
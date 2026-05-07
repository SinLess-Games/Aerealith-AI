// libs/db/src/entities/user/account.entity.ts

import {
  Entity,
  Index,
  LoadStrategy,
  ManyToOne,
  Property,
  Unique,
  type Rel,
} from '@mikro-orm/core';

import { BaseEntity } from '../../entity.base.js';
import { User } from './user.entity.js';

export type UserAccountStatus = 'active' | 'revoked' | 'suspended' | 'expired';

/**
 * UserAccount
 *
 * Represents an external authentication or integration account linked to a User.
 *
 * Examples:
 * - Google OAuth account
 * - GitHub OAuth account
 * - Discord OAuth account
 *
 * Table: user_account
 */
@Entity({ tableName: 'user_account' })
@Index({ name: 'idx_user_account_user', properties: ['user'] })
@Index({ name: 'idx_user_account_provider', properties: ['provider'] })
@Index({
  name: 'idx_user_account_provider_account_id',
  properties: ['provider', 'accountId'],
})
@Unique({
  name: 'uq_user_account_provider_account_id',
  properties: ['provider', 'accountId'],
})
export class UserAccount extends BaseEntity {
  /**
   * Owning user.
   *
   * Each linked external account belongs to exactly one Helix user.
   */
  @ManyToOne(() => User, {
    fieldName: 'user_id',
    nullable: false,
    strategy: LoadStrategy.JOINED,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  /** External provider name, for example: google, github, discord. */
  @Property({ type: 'text' })
  provider!: string;

  /** Provider-side account identifier. */
  @Property({ type: 'text', fieldName: 'account_id' })
  accountId!: string;

  /** Human-readable display name for the linked account. */
  @Property({ type: 'text', fieldName: 'display_name' })
  displayName!: string;

  /** Optional provider account management/settings URL. */
  @Property({ type: 'text', fieldName: 'management_url', nullable: true })
  managementUrl?: string;

  /** Current connection status. */
  @Property({ type: 'text', default: 'active' })
  status: UserAccountStatus = 'active';

  /** Timestamp for when the account was connected. */
  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    fieldName: 'connected_at',
    defaultRaw: 'CURRENT_TIMESTAMP',
  })
  connectedAt: Date = new Date();

  /**
   * Stable deterministic ID seed.
   *
   * This makes the entity ID stable for the same provider/account pair.
   */
  protected override getDeterministicIdSeed(): string | undefined {
    if (!this.provider || !this.accountId) {
      return undefined;
    }

    return `${this.provider}:${this.accountId}`;
  }
}
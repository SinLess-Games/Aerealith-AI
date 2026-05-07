// libs/db/src/entities/user/profile.entity.ts

import {
  Entity,
  Index,
  LoadStrategy,
  OneToOne,
  Property,
  Unique,
  type Rel,
} from '@mikro-orm/core';

import { BaseEntity } from '../../entity.base.js';
import { User } from './user.entity.js';

export type UserProfileLinks = Record<string, string | undefined>;

/**
 * UserProfile
 *
 * Stores public-facing profile data for a Helix user.
 *
 * Table: user_profile
 */
@Entity({ tableName: 'user_profile' })
@Unique({ name: 'uq_user_profile_user', properties: ['user'] })
@Unique({ name: 'uq_user_profile_handle', properties: ['handle'] })
@Index({ name: 'idx_user_profile_handle', properties: ['handle'] })
export class UserProfile extends BaseEntity {
  /**
   * Owning side of the one-to-one user/profile relationship.
   *
   * The foreign key lives on this table as user_id.
   */
  @OneToOne(() => User, (user) => user.profile, {
    owner: true,
    fieldName: 'user_id',
    nullable: false,
    unique: true,
    strategy: LoadStrategy.JOINED,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  /** Public handle/alias. Must be unique across all user profiles. */
  @Property({ type: 'text' })
  handle!: string;

  /** Optional avatar image URL. */
  @Property({ type: 'text', fieldName: 'avatar_url', nullable: true })
  avatarUrl?: string;

  /** Optional short public bio/description. */
  @Property({ type: 'text', nullable: true })
  bio?: string;

  /**
   * Optional external profile links.
   *
   * Example:
   * {
   *   "github": "https://github.com/sinless777",
   *   "website": "https://helixaibot.com"
   * }
   */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  links?: UserProfileLinks;

  /**
   * Stable deterministic ID seed.
   *
   * Prefer the owning user ID when available so profile IDs remain stable even
   * when handles change.
   */
  protected override getDeterministicIdSeed(): string | undefined {
    const userId = this.user?.id;

    if (userId) {
      return `user-profile:${userId}`;
    }

    if (this.handle) {
      return `user-profile:${this.handle}`;
    }

    return undefined;
  }
}
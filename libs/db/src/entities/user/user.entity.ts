// libs/db/src/entities/user/user.entity.ts

import {
  Cascade,
  Collection,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  Property,
  Unique,
  type Rel,
} from '@mikro-orm/core';

import { BaseEntity } from '../../entity.base.js';
import { UserAccount } from './account.entity.js';
import { UserProfile } from './profile.entity.js';
import { UserSession } from './session.entity.js';
import { UserSettings } from './settings.entity.js';
import { UserVerificationToken } from './verification-token.entity.js';

export type UserStatus = 'active' | 'disabled' | 'suspended' | 'pending';

export type UserMetadata = Record<string, unknown>;

/**
 * User
 *
 * Represents a Helix application user.
 *
 * Table: app_user
 */
@Entity({ tableName: 'app_user' })
@Unique({ name: 'uq_app_user_email', properties: ['email'] })
@Index({ name: 'idx_app_user_email', properties: ['email'] })
@Index({ name: 'idx_app_user_status', properties: ['status'] })
export class User extends BaseEntity {
  /** Primary email address for the user. */
  @Property({ type: 'text' })
  email!: string;

  /** Human-readable display name. */
  @Property({ type: 'text', fieldName: 'display_name' })
  displayName!: string;

  /** Current account status. */
  @Property({ type: 'text', default: 'active' })
  status: UserStatus = 'active';

  /** Optional metadata for user-owned non-sensitive attributes. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  metadata?: UserMetadata;

  /**
   * User profile.
   *
   * Inverse side. The owning FK lives on user_profile.user_id.
   */
  @OneToOne(() => UserProfile, (profile) => profile.user, {
    nullable: true,
    eager: true,
  })
  profile?: Rel<UserProfile>;

  /**
   * User settings.
   *
   * Inverse side. The owning FK lives on user_settings.user_id.
   */
  @OneToOne(() => UserSettings, (settings) => settings.user, {
    nullable: true,
    eager: false,
  })
  settings?: Rel<UserSettings>;

  /** External OAuth or integration accounts linked to this user. */
  @OneToMany(() => UserAccount, (account) => account.user, {
    cascade: [Cascade.PERSIST, Cascade.REMOVE],
    orphanRemoval: true,
  })
  accounts = new Collection<Rel<UserAccount>>(this);

  /** Active or historical user sessions. */
  @OneToMany(() => UserSession, (session) => session.user, {
    cascade: [Cascade.PERSIST, Cascade.REMOVE],
    orphanRemoval: true,
  })
  sessions = new Collection<Rel<UserSession>>(this);

  /** Verification, password reset, MFA, and magic-link tokens. */
  @OneToMany(() => UserVerificationToken, (token) => token.user, {
    cascade: [Cascade.PERSIST, Cascade.REMOVE],
    orphanRemoval: true,
  })
  verificationTokens = new Collection<Rel<UserVerificationToken>>(this);

  /**
   * Stable deterministic ID seed.
   *
   * Email is unique, so this keeps user IDs stable for the same email.
   */
  protected override getDeterministicIdSeed(): string | undefined {
    if (!this.email) {
      return undefined;
    }

    return `user:${this.email.toLowerCase()}`;
  }
}
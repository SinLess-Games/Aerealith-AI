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
import { UserAchievement } from './achievement.entity.js';
import { UserActivityEvent } from './activity-event.entity.js';
import { UserAppConnection } from './app-connection.entity.js';
import { UserFileReference } from './file-reference.entity.js';
import { UserIntegration } from './integration.entity.js';
import { UserProfile } from './profile.entity.js';
import { UserReport } from './report.entity.js';
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
@Unique({ name: 'uq_app_user_username', properties: ['username'] })
@Index({ name: 'idx_app_user_email', properties: ['email'] })
@Index({ name: 'idx_app_user_username', properties: ['username'] })
@Index({ name: 'idx_app_user_status', properties: ['status'] })
export class User extends BaseEntity {
  /** Unique login/display handle used by auth routes. */
  @Property({ type: 'text' })
  username!: string;

  /** Primary email address for the user. */
  @Property({ type: 'text' })
  email!: string;

  /** Human-readable display name. */
  @Property({ type: 'text', fieldName: 'display_name' })
  displayName!: string;

  /** Current account status. */
  @Property({ type: 'text', default: 'active' })
  status: UserStatus = 'active';

  /** True after the primary email has been confirmed. */
  @Property({ type: 'boolean', fieldName: 'email_verified', default: false })
  emailVerified = false;

  /** Timestamp for when the primary email was confirmed. */
  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    fieldName: 'email_verified_at',
    nullable: true,
  })
  emailVerifiedAt?: Date | null = null;

  /** Hashed credentials password. Never expose this in API responses. */
  @Property({
    type: 'text',
    fieldName: 'password_hash',
    nullable: true,
    hidden: true,
  })
  hashedPassword?: string | null = null;

  /** Optional metadata for user-owned non-sensitive attributes. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  metadata: UserMetadata = {};

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

  @OneToMany(() => UserAchievement, (achievement) => achievement.user, {
    cascade: [Cascade.PERSIST, Cascade.REMOVE],
    orphanRemoval: true,
  })
  achievements = new Collection<Rel<UserAchievement>>(this);

  @OneToMany(() => UserAppConnection, (connection) => connection.user, {
    cascade: [Cascade.PERSIST, Cascade.REMOVE],
    orphanRemoval: true,
  })
  appConnections = new Collection<Rel<UserAppConnection>>(this);

  @OneToMany(() => UserIntegration, (integration) => integration.user, {
    cascade: [Cascade.PERSIST, Cascade.REMOVE],
    orphanRemoval: true,
  })
  integrations = new Collection<Rel<UserIntegration>>(this);

  @OneToMany(() => UserFileReference, (fileReference) => fileReference.user, {
    cascade: [Cascade.PERSIST, Cascade.REMOVE],
    orphanRemoval: true,
  })
  fileReferences = new Collection<Rel<UserFileReference>>(this);

  @OneToMany(() => UserReport, (report) => report.user, {
    cascade: [Cascade.PERSIST, Cascade.REMOVE],
    orphanRemoval: true,
  })
  reports = new Collection<Rel<UserReport>>(this);

  @OneToMany(() => UserActivityEvent, (activityEvent) => activityEvent.user, {
    cascade: [Cascade.PERSIST, Cascade.REMOVE],
    orphanRemoval: true,
  })
  activityEvents = new Collection<Rel<UserActivityEvent>>(this);

  get passwordHash(): string | undefined {
    return this.hashedPassword ?? undefined;
  }

  set passwordHash(value: string | undefined) {
    this.hashedPassword = value;
  }

  /**
   * Stable deterministic ID seed.
   *
   * Username is unique, so this keeps user IDs stable for the same username.
   */
  protected override getDeterministicIdSeed(): string | undefined {
    if (!this.username) {
      return undefined;
    }

    return `user:${this.username.toLowerCase()}`;
  }
}

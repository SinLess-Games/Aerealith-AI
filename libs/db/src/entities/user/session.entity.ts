// libs/db/src/entities/user/session.entity.ts

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

/**
 * UserSession
 *
 * Represents an active authentication, browser, or API session for a User.
 *
 * Table: user_session
 */
@Entity({ tableName: 'user_session' })
@Unique({ name: 'uq_user_session_token', properties: ['sessionToken'] })
@Index({ name: 'idx_user_session_user', properties: ['user'] })
@Index({ name: 'idx_user_session_expires', properties: ['expires'] })
@Index({
  name: 'idx_user_session_user_expires',
  properties: ['user', 'expires'],
})
export class UserSession extends BaseEntity {
  /**
   * Secure session token.
   *
   * Prefer storing a hashed token here at the service layer instead of storing
   * the raw token directly.
   */
  @Property({ type: 'text', fieldName: 'session_token' })
  sessionToken!: string;

  /** Friendly device label shown in session management UI. */
  @Property({ type: 'text', fieldName: 'device_name', nullable: true })
  deviceName?: string | null = null;

  /** User agent captured when the session was last created or refreshed. */
  @Property({ type: 'text', fieldName: 'user_agent', nullable: true })
  userAgent?: string | null = null;

  /** IP address captured when the session was last created or refreshed. */
  @Property({ type: 'text', fieldName: 'ip_address', nullable: true })
  ipAddress?: string | null = null;

  /** Timestamp for the most recent session activity. */
  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    fieldName: 'last_seen_at',
    nullable: true,
  })
  lastSeenAt?: Date | null = null;

  /** Expiration timestamp for this session. */
  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
  })
  expires!: Date;

  /** Owning user. Each session belongs to exactly one user. */
  @ManyToOne(() => User, {
    inversedBy: 'sessions',
    fieldName: 'user_id',
    nullable: false,
    strategy: LoadStrategy.JOINED,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  /** Returns true when the session expiration is in the past. */
  isExpired(now: Date = new Date()): boolean {
    return this.expires.getTime() <= now.getTime();
  }

  /**
   * Stable deterministic ID seed.
   *
   * The session token is already unique, so the entity ID can be stable for
   * the same persisted session record.
   */
  protected override getDeterministicIdSeed(): string | undefined {
    if (!this.sessionToken) {
      return undefined;
    }

    return `user-session:${this.sessionToken}`;
  }
}

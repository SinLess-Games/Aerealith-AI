// libs/db/src/entities/user/verification-token.entity.ts

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

export type UserVerificationTokenPurpose =
  | 'email_verification'
  | 'password_reset'
  | 'mfa'
  | 'magic_link'
  | 'account_recovery';

/**
 * UserVerificationToken
 *
 * Represents a one-time-use token linked to a User for verification flows.
 *
 * Examples:
 * - Email confirmation
 * - Password reset
 * - Multi-factor authentication
 * - Magic link login
 *
 * Table: user_verification_token
 */
@Entity({ tableName: 'user_verification_token' })
@Unique({
  name: 'uq_user_verification_token_identifier_token',
  properties: ['identifier', 'token'],
})
@Index({
  name: 'idx_user_verification_token_identifier',
  properties: ['identifier'],
})
@Index({
  name: 'idx_user_verification_token_token',
  properties: ['token'],
})
@Index({
  name: 'idx_user_verification_token_user',
  properties: ['user'],
})
@Index({
  name: 'idx_user_verification_token_user_expires',
  properties: ['user', 'expires'],
})
@Index({
  name: 'idx_user_verification_token_expires',
  properties: ['expires'],
})
export class UserVerificationToken extends BaseEntity {
  /**
   * Logical identifier for this token.
   *
   * Usually an email address, username, or provider-specific account identifier.
   */
  @Property({ type: 'text' })
  identifier!: string;

  /** Owning user. Each verification token belongs to exactly one user. */
  @ManyToOne(() => User, {
    inversedBy: 'verificationTokens',
    fieldName: 'user_id',
    nullable: false,
    strategy: LoadStrategy.JOINED,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  /**
   * Verification token value.
   *
   * Prefer storing a hashed token here at the service layer instead of storing
   * the raw token directly.
   */
  @Property({ type: 'text' })
  token!: string;

  /** Verification flow this token belongs to. */
  @Property({
    type: 'text',
    default: 'email_verification',
  })
  purpose: UserVerificationTokenPurpose = 'email_verification';

  /** Expiration timestamp after which this token is invalid. */
  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
  })
  expires!: Date;

  /** Timestamp for when this token was consumed. Null means unused. */
  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    fieldName: 'consumed_at',
    nullable: true,
  })
  consumedAt?: Date | null = null;

  /** Returns true when the token expiration is in the past. */
  isExpired(now: Date = new Date()): boolean {
    return this.expires.getTime() <= now.getTime();
  }

  /** Returns true when the token has already been consumed. */
  isConsumed(): boolean {
    return this.consumedAt instanceof Date;
  }

  /** Returns true when the token is unused and not expired. */
  isValid(now: Date = new Date()): boolean {
    return !this.isConsumed() && !this.isExpired(now);
  }

  /** Marks the token as consumed. */
  consume(now: Date = new Date()): void {
    this.consumedAt = now;
  }

  /**
   * Stable deterministic ID seed.
   *
   * The identifier/token pair is unique, so it can safely produce a stable ID
   * for the persisted verification token record.
   */
  protected override getDeterministicIdSeed(): string | undefined {
    if (!this.identifier || !this.token) {
      return undefined;
    }

    return `user-verification-token:${this.identifier}:${this.token}`;
  }
}

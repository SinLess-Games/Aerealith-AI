// libs/db/src/entities/user/settings.entity.ts

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

export type UserNotificationSettings = {
  email?: boolean;
  push?: boolean;
  sms?: boolean;
  marketing?: boolean;
  security?: boolean;
  productUpdates?: boolean;
  [key: string]: unknown;
};

export type UserPrivacySettings = {
  profileVisibility?: 'public' | 'private' | 'organization';
  discoverable?: boolean;
  showActivity?: boolean;
  showLinkedAccounts?: boolean;
  allowPersonalization?: boolean;
  [key: string]: unknown;
};

export type UserAccessibilitySettings = {
  reducedMotion?: boolean;
  highContrast?: boolean;
  largeText?: boolean;
  screenReaderOptimized?: boolean;
  colorBlindMode?: string;
  [key: string]: unknown;
};

export type UserProductSettings = {
  accentColor?: string;
  appearance?: 'light' | 'dark' | 'system';
  personality?: string;
  quietMode?: boolean;
  betaFeatures?: boolean;
  [key: string]: unknown;
};

/**
 * UserSettings
 *
 * Stores user-level preferences and personalization settings.
 *
 * Table: user_settings
 */
@Entity({ tableName: 'user_settings' })
@Unique({ name: 'uq_user_settings_user', properties: ['user'] })
@Index({ name: 'idx_user_settings_user', properties: ['user'] })
export class UserSettings extends BaseEntity {
  /**
   * Owning side of the one-to-one user/settings relationship.
   *
   * The foreign key lives on this table as user_id.
   */
  @OneToOne(() => User, (user) => user.settings, {
    owner: true,
    fieldName: 'user_id',
    nullable: false,
    unique: true,
    strategy: LoadStrategy.JOINED,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  /** Notification preferences such as email, push, SMS, and security alerts. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  notifications?: UserNotificationSettings;

  /** Privacy preferences such as discoverability and profile visibility. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  privacy?: UserPrivacySettings;

  /** Accessibility preferences such as reduced motion and high contrast. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  accessibility?: UserAccessibilitySettings;

  /** Product preferences, feature toggles, theme options, and user flags. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  product?: UserProductSettings;

  /**
   * Stable deterministic ID seed.
   *
   * Prefer the owning user ID so settings IDs remain stable for each user.
   */
  protected override getDeterministicIdSeed(): string | undefined {
    const userId = this.user?.id;

    if (!userId) {
      return undefined;
    }

    return `user-settings:${userId}`;
  }
}
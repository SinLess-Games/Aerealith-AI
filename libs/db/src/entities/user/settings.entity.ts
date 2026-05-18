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
import type {
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
} from '../../types/user-settings/index.js';
import { User } from './user.entity.js';

/**
 * UserSettings
 *
 * Stores user-level preferences, personalization settings, privacy controls,
 * accessibility preferences, notification rules, AI behavior, memory controls,
 * security settings, and integration preferences.
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

  /** Settings metadata such as schema version, sync state, and source. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  metadata: UserSettingsMetadata = {};

  /** Accessibility preferences such as motion, contrast, text, media, and assistive technology settings. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  accessibility: AccessibilityUserSettings = {};

  /** Account lifecycle, onboarding, legal, export, deletion, and organization preferences. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  account: AccountUserSettings = {};

  /** AI behavior, model routing, tool permissions, safety, privacy, citations, and developer preferences. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  ai: AiUserSettings = {};

  /** Appearance preferences such as theme, layout, typography, visual effects, and data display. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  appearance: AppearanceUserSettings = {};

  /** Communication preferences such as tone, verbosity, progress updates, quiet mode, and channels. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  communication: CommunicationUserSettings = {};

  /** Content preferences such as maturity, filtering, media, spoilers, recommendations, and interactions. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  content: ContentUserSettings = {};

  /** Developer preferences such as stack, formatting, TypeScript, testing, Git, CI/CD, docs, and tooling. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  developer: DeveloperUserSettings = {};

  /** Integration preferences such as providers, connected accounts, scopes, sync, webhooks, and permissions. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  integrations: IntegrationUserSettings = {};

  /** Localization preferences such as locale, timezone, date/time formats, numbers, currency, and units. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  localization: LocalizationUserSettings = {};

  /** Memory preferences such as save/recall behavior, retention, review, privacy, scope, and export. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  memory: MemoryUserSettings = {};

  /** Notification preferences such as channels, categories, quiet hours, digests, devices, sound, and vibration. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  notifications: NotificationUserSettings = {};

  /** Privacy preferences such as profile visibility, consent, analytics, personalization, AI, sharing, and data rights. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  privacy: PrivacyUserSettings = {};

  /** Security preferences such as MFA, passkeys, sessions, trusted devices, recovery, API keys, audit, and encryption. */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  security: SecurityUserSettings = {};

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

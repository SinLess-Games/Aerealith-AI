// libs/db/src/entities/user/profile.entity.ts

import {
  Entity,
  Enum,
  Index,
  LoadStrategy,
  OneToOne,
  Property,
  Unique,
  type Rel,
} from '@mikro-orm/core';

import { BaseEntity } from '../../entity.base';
import { ContentMaturity } from '../../enums/content-maturity.enum';
import { Country } from '../../enums/country.enum';
import { DateFormat } from '../../enums/date-format.enum';
import { Gender } from '../../enums/gender.enum';
import { LanguageProficiency } from '../../enums/language-proficiency.enum';
import { Languages } from '../../enums/languages.enum';
import { MeasurementSystem } from '../../enums/measurement-system.enum';
import { NameDisplayOrder } from '../../enums/name-display-order.enum';
import { ProfileFieldVisibility } from '../../enums/profile-field-visibility.enum';
import { ProfileLinkPlatform } from '../../enums/profile-link-platform.enum';
import { ProfileStatus } from '../../enums/profile-status.enum';
import { ProfileVisibility } from '../../enums/profile-visibility.enum';
import { Sex } from '../../enums/sex.enum';
import { Sexuality } from '../../enums/sexuality.enum';
import { TimeFormat } from '../../enums/time-format.enum';
import { TimezoneGreenwich } from '../../enums/timezone-greenwich.enum';
import { TimezoneUtc } from '../../enums/timezone-utc.enum';
import { WeekStartDay } from '../../enums/week-start-day.enum';
import { User } from './user.entity';

export type UserProfileLinks = Partial<Record<ProfileLinkPlatform, string>> &
  Record<string, string | undefined>;

export type UserProfileFieldVisibility = Partial<
  Record<string, ProfileFieldVisibility>
>;

export const defaultUserProfileFieldVisibility: UserProfileFieldVisibility = {
  displayName: ProfileFieldVisibility.Public,
  givenName: ProfileFieldVisibility.Private,
  middleName: ProfileFieldVisibility.Private,
  familyName: ProfileFieldVisibility.Private,
  pronouns: ProfileFieldVisibility.Public,
  avatarUrl: ProfileFieldVisibility.Public,
  bannerUrl: ProfileFieldVisibility.Public,
  bio: ProfileFieldVisibility.Public,
  locationLabel: ProfileFieldVisibility.Public,
  country: ProfileFieldVisibility.Public,
  gender: ProfileFieldVisibility.Private,
  sex: ProfileFieldVisibility.Private,
  sexuality: ProfileFieldVisibility.Private,
  primaryLanguage: ProfileFieldVisibility.Public,
  languages: ProfileFieldVisibility.Public,
  locale: ProfileFieldVisibility.Private,
  timezone: ProfileFieldVisibility.Private,
  timezoneUtc: ProfileFieldVisibility.Private,
  timezoneGreenwich: ProfileFieldVisibility.Private,
  weekStartDay: ProfileFieldVisibility.Private,
  dateFormat: ProfileFieldVisibility.Private,
  timeFormat: ProfileFieldVisibility.Private,
  nameDisplayOrder: ProfileFieldVisibility.Private,
  measurementSystem: ProfileFieldVisibility.Private,
  contentMaturity: ProfileFieldVisibility.Private,
  websiteUrl: ProfileFieldVisibility.Public,
  links: ProfileFieldVisibility.Public,
  createdAt: ProfileFieldVisibility.Public,
  updatedAt: ProfileFieldVisibility.Private,
};

export type UserProfileLanguage = {
  language: Languages;
  proficiency?: LanguageProficiency;
  isPrimary?: boolean;
};

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
@Index({ name: 'idx_user_profile_display_name', properties: ['displayName'] })
@Index({ name: 'idx_user_profile_country', properties: ['country'] })
@Index({ name: 'idx_user_profile_status', properties: ['status'] })
@Index({ name: 'idx_user_profile_visibility', properties: ['visibility'] })
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

  /** Optional public display name. */
  @Property({ type: 'text', fieldName: 'display_name', nullable: true })
  displayName?: string | null = null;

  /** Optional given/first name. */
  @Property({ type: 'text', fieldName: 'given_name', nullable: true })
  givenName?: string | null = null;

  /** Optional middle name. */
  @Property({ type: 'text', fieldName: 'middle_name', nullable: true })
  middleName?: string | null = null;

  /** Optional family/last name. */
  @Property({ type: 'text', fieldName: 'family_name', nullable: true })
  familyName?: string | null = null;

  /** Optional public pronouns. */
  @Property({ type: 'text', nullable: true })
  pronouns?: string | null = null;

  /** Optional avatar image URL. */
  @Property({ type: 'text', fieldName: 'avatar_url', nullable: true })
  avatarUrl?: string | null = null;

  /** Optional banner/header image URL. */
  @Property({ type: 'text', fieldName: 'banner_url', nullable: true })
  bannerUrl?: string | null = null;

  /** Optional short public bio/description. */
  @Property({ type: 'text', nullable: true })
  bio?: string | null = null;

  /** Optional whole-profile lifecycle status. */
  @Enum({
    items: () => ProfileStatus,
    fieldName: 'status',
    nullable: false,
  })
  status: ProfileStatus = ProfileStatus.PendingSetup;

  /** Optional whole-profile visibility setting. */
  @Enum({
    items: () => ProfileVisibility,
    fieldName: 'visibility',
    nullable: false,
  })
  visibility: ProfileVisibility = ProfileVisibility.Private;

  /**
   * Optional per-field visibility overrides.
   *
   * Example:
   * {
   *   "country": "public",
   *   "gender": "private",
   *   "sexuality": "private"
   * }
   */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    fieldName: 'field_visibility',
    nullable: false,
    defaultRaw: `'${JSON.stringify(defaultUserProfileFieldVisibility)}'::jsonb`,
  })
  fieldVisibility: UserProfileFieldVisibility = {
    ...defaultUserProfileFieldVisibility,
  };

  /** Optional profile location label intended for public display. */
  @Property({ type: 'text', fieldName: 'location_label', nullable: true })
  locationLabel?: string | null = null;

  /** Optional ISO 3166-1 alpha-2 country code. */
  @Enum({
    items: () => Country,
    fieldName: 'country',
    nullable: true,
  })
  country?: Country | null = null;

  /** Optional user-selected gender identity. */
  @Enum({
    items: () => Gender,
    fieldName: 'gender',
    nullable: true,
  })
  gender?: Gender | null = null;

  /** Optional user-selected biological sex value. */
  @Enum({
    items: () => Sex,
    fieldName: 'sex',
    nullable: true,
  })
  sex?: Sex | null = null;

  /** Optional user-selected sexuality or sexual orientation. */
  @Enum({
    items: () => Sexuality,
    fieldName: 'sexuality',
    nullable: true,
  })
  sexuality?: Sexuality | null = null;

  /** Optional preferred primary language. */
  @Enum({
    items: () => Languages,
    fieldName: 'primary_language',
    nullable: true,
  })
  primaryLanguage?: Languages | null = null;

  /**
   * Optional profile language list with proficiency metadata.
   *
   * Example:
   * [
   *   { "language": "eng", "proficiency": "native", "isPrimary": true },
   *   { "language": "spa", "proficiency": "conversational" }
   * ]
   */
  @Property({
    type: 'json',
    columnType: 'jsonb',
    nullable: true,
  })
  languages: UserProfileLanguage[] = [];

  /** Optional IETF BCP 47 locale code such as en-US. */
  @Property({ type: 'text', nullable: true })
  locale?: string | null = null;

  /** Optional IANA timezone such as America/Boise. */
  @Property({ type: 'text', nullable: true })
  timezone?: string | null = null;

  /** Optional UTC offset timezone preference such as UTC-07:00. */
  @Enum({
    items: () => TimezoneUtc,
    fieldName: 'timezone_utc',
    nullable: true,
  })
  timezoneUtc?: TimezoneUtc | null = null;

  /** Optional GMT offset timezone preference such as GMT-07:00. */
  @Enum({
    items: () => TimezoneGreenwich,
    fieldName: 'timezone_greenwich',
    nullable: true,
  })
  timezoneGreenwich?: TimezoneGreenwich | null = null;

  /** Optional preferred first day of the week. */
  @Enum({
    items: () => WeekStartDay,
    fieldName: 'week_start_day',
    nullable: true,
  })
  weekStartDay?: WeekStartDay | null = null;

  /** Optional preferred date display format. */
  @Enum({
    items: () => DateFormat,
    fieldName: 'date_format',
    nullable: true,
  })
  dateFormat?: DateFormat | null = null;

  /** Optional preferred time display format. */
  @Enum({
    items: () => TimeFormat,
    fieldName: 'time_format',
    nullable: true,
  })
  timeFormat?: TimeFormat | null = null;

  /** Optional preferred name display order. */
  @Enum({
    items: () => NameDisplayOrder,
    fieldName: 'name_display_order',
    nullable: true,
  })
  nameDisplayOrder?: NameDisplayOrder | null = null;

  /** Optional preferred measurement system. */
  @Enum({
    items: () => MeasurementSystem,
    fieldName: 'measurement_system',
    nullable: true,
  })
  measurementSystem?: MeasurementSystem | null = null;

  /** Optional preferred content maturity setting. */
  @Enum({
    items: () => ContentMaturity,
    fieldName: 'content_maturity',
    nullable: true,
  })
  contentMaturity?: ContentMaturity | null = null;

  /** Optional public website URL. */
  @Property({ type: 'text', fieldName: 'website_url', nullable: true })
  websiteUrl?: string | null = null;

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
  links: UserProfileLinks = {};

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

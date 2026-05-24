import {
  ContentMaturity,
  Country,
  DateFormat,
  Gender,
  LanguageProficiency,
  Languages,
  MeasurementSystem,
  NameDisplayOrder,
  ProfileFieldVisibility,
  ProfileLinkPlatform,
  ProfileStatus,
  ProfileVisibility,
  Sex,
  Sexuality,
  TimeFormat,
  TimezoneGreenwich,
  TimezoneUtc,
  WeekStartDay,
} from '@aerealith-ai/db';

import type { ProfileEditOptions, ProfileSelectOption } from '../../types';

type EnumLike = Record<string, string | number>;

const KNOWN_ACRONYMS = new Set([
  'AI',
  'API',
  'CDN',
  'CPU',
  'CSS',
  'CSV',
  'DNS',
  'EU',
  'GMT',
  'GPU',
  'HTML',
  'ID',
  'JSON',
  'MFA',
  'OAuth',
  'REST',
  'SDK',
  'SSO',
  'TLS',
  'UK',
  'US',
  'USA',
  'UTC',
  'XML',
  'YAML',
]);

function formatEnumKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upperWord = word.toUpperCase();

      if (KNOWN_ACRONYMS.has(upperWord)) {
        return upperWord;
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(' ')
    .trim();
}

function isReverseNumericEnumEntry(key: string): boolean {
  return !Number.isNaN(Number(key));
}

function toOptions(enumObject: EnumLike): ProfileSelectOption[] {
  const seen = new Set<string>();

  return Object.entries(enumObject)
    .filter(
      (entry): entry is [string, string] =>
        !isReverseNumericEnumEntry(entry[0]) && typeof entry[1] === 'string',
    )
    .filter(([, value]) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    })
    .map(([key, value]) => ({
      label: formatEnumKey(key),
      value,
    }));
}

export const profileEditOptions = {
  contentMaturity: toOptions(ContentMaturity),
  countries: toOptions(Country),
  dateFormats: toOptions(DateFormat),
  genders: toOptions(Gender),
  languageProficiencies: toOptions(LanguageProficiency),
  languages: toOptions(Languages),
  measurementSystems: toOptions(MeasurementSystem),
  nameDisplayOrders: toOptions(NameDisplayOrder),
  profileFieldVisibilities: toOptions(ProfileFieldVisibility),
  profileLinkPlatforms: toOptions(ProfileLinkPlatform),
  profileStatuses: toOptions(ProfileStatus),
  profileVisibilities: toOptions(ProfileVisibility),
  sexes: toOptions(Sex),
  sexualities: toOptions(Sexuality),
  timeFormats: toOptions(TimeFormat),
  timezoneGreenwich: toOptions(TimezoneGreenwich),
  timezoneUtc: toOptions(TimezoneUtc),
  weekStartDays: toOptions(WeekStartDay),
} satisfies ProfileEditOptions;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `profileEditOptions` for new imports.
 */
export const PROFILE_EDIT_OPTIONS = profileEditOptions;
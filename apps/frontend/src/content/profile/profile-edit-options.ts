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
} from '../../../../../libs/db/src/enums/index';
import type { ProfileEditOptions, ProfileSelectOption } from '@helix-ai/ui';

type EnumLike = Record<string, string | number>;

function formatEnumKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

function toOptions(enumObject: EnumLike): ProfileSelectOption[] {
  const seen = new Set<string>();

  return Object.entries(enumObject)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
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

export const profileEditOptions: ProfileEditOptions = {
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
};

// libs/db/src/types/user-settings/localization.type.ts

import type { Country } from '../../enums/country.enum';
import type { DateFormat } from '../../enums/date-format.enum';
import type { Languages } from '../../enums/languages.enum';
import type { MeasurementSystem } from '../../enums/measurement-system.enum';
import type { TimeFormat } from '../../enums/time-format.enum';
import type { TimezoneGreenwich } from '../../enums/timezone-greenwich.enum';
import type { TimezoneUtc } from '../../enums/timezone-utc.enum';
import type { WeekStartDay } from '../../enums/week-start-day.enum';

export type LocalizationPreferenceMode = 'system' | 'enabled' | 'disabled';

export type LocalizationFallbackBehavior =
  | 'system'
  | 'browser'
  | 'account'
  | 'organization'
  | 'default'
  | 'custom';

export type LocalizationCalendarSystem =
  | 'locale_default'
  | 'gregory'
  | 'buddhist'
  | 'chinese'
  | 'coptic'
  | 'dangi'
  | 'ethiopic'
  | 'ethiopic_amete_alem'
  | 'hebrew'
  | 'indian'
  | 'islamic'
  | 'islamic_civil'
  | 'islamic_rgsa'
  | 'islamic_tbla'
  | 'islamic_umalqura'
  | 'iso8601'
  | 'japanese'
  | 'persian'
  | 'roc'
  | 'custom';

export type LocalizationHourCycle =
  | 'locale_default'
  | 'h11'
  | 'h12'
  | 'h23'
  | 'h24';

export type LocalizationNumberingSystem =
  | 'locale_default'
  | 'arab'
  | 'arabext'
  | 'bali'
  | 'beng'
  | 'deva'
  | 'fullwide'
  | 'gujr'
  | 'guru'
  | 'hanidec'
  | 'khmr'
  | 'knda'
  | 'laoo'
  | 'latn'
  | 'limb'
  | 'mlym'
  | 'mong'
  | 'mymr'
  | 'orya'
  | 'tamldec'
  | 'telu'
  | 'thai'
  | 'tibt'
  | 'custom';

export type LocalizationCurrencyDisplay =
  | 'symbol'
  | 'narrow_symbol'
  | 'code'
  | 'name';

export type LocalizationCurrencySign = 'standard' | 'accounting';

export type LocalizationUnitDisplay = 'narrow' | 'short' | 'long';

export type LocalizationRelativeTimeStyle =
  | 'disabled'
  | 'narrow'
  | 'short'
  | 'long';

export type LocalizationListStyle = 'narrow' | 'short' | 'long';

export type LocalizationListType =
  | 'conjunction'
  | 'disjunction'
  | 'unit';

export type LocalizationTextDirection =
  | 'locale_default'
  | 'ltr'
  | 'rtl'
  | 'auto';

export type LocalizationLanguagePreference = {
  language: Languages;
  locale?: string;
  fallbackLocale?: string;
  priority?: number;
};

export type LocalizationLocaleSettings = {
  locale?: string;
  fallbackLocale?: string;
  fallbackBehavior?: LocalizationFallbackBehavior;
  preferredLanguages?: LocalizationLanguagePreference[];
  textDirection?: LocalizationTextDirection;
  country?: Country;
  region?: string;
};

export type LocalizationTimezoneSettings = {
  timezone?: string;
  timezoneUtc?: TimezoneUtc;
  timezoneGreenwich?: TimezoneGreenwich;
  fallbackTimezone?: string;
  displayTimezoneName?: boolean;
  showTimezoneOffset?: boolean;
  useFixedUtcOffset?: boolean;
};

export type LocalizationDateTimeSettings = {
  calendarSystem?: LocalizationCalendarSystem;
  dateFormat?: DateFormat;
  timeFormat?: TimeFormat;
  weekStartDay?: WeekStartDay;
  hourCycle?: LocalizationHourCycle;
  showWeekNumbers?: boolean;
  showRelativeTime?: boolean;
  relativeTimeStyle?: LocalizationRelativeTimeStyle;
  showSeconds?: boolean;
  showMilliseconds?: boolean;
};

export type LocalizationNumberSettings = {
  numberingSystem?: LocalizationNumberingSystem;
  decimalSeparator?: string;
  groupingSeparator?: string;
  useGrouping?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export type LocalizationCurrencySettings = {
  currencyCode?: string;
  currencyDisplay?: LocalizationCurrencyDisplay;
  currencySign?: LocalizationCurrencySign;
  showCurrencyCode?: boolean;
  accountingNegativeNumbers?: boolean;
};

export type LocalizationUnitSettings = {
  measurementSystem?: MeasurementSystem;
  unitDisplay?: LocalizationUnitDisplay;
};

export type LocalizationFormattingSettings = {
  listStyle?: LocalizationListStyle;
  listType?: LocalizationListType;
  compactNumbers?: boolean;
  ordinalNumbers?: boolean;
  localizedNames?: boolean;
};

export type LocalizationUserSettings = {
  mode?: LocalizationPreferenceMode;
  locale?: LocalizationLocaleSettings;
  timezone?: LocalizationTimezoneSettings;
  dateTime?: LocalizationDateTimeSettings;
  numbers?: LocalizationNumberSettings;
  currency?: LocalizationCurrencySettings;
  units?: LocalizationUnitSettings;
  formatting?: LocalizationFormattingSettings;
};

export type LocalizationUserSettingsPatch = {
  mode?: LocalizationPreferenceMode;
  locale?: Partial<LocalizationLocaleSettings>;
  timezone?: Partial<LocalizationTimezoneSettings>;
  dateTime?: Partial<LocalizationDateTimeSettings>;
  numbers?: Partial<LocalizationNumberSettings>;
  currency?: Partial<LocalizationCurrencySettings>;
  units?: Partial<LocalizationUnitSettings>;
  formatting?: Partial<LocalizationFormattingSettings>;
};

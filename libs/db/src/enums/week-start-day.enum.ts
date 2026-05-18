// libs/db/src/enums/week-start-day.enum.ts

/**
 * WeekStartDay enum representing user-selectable first day of week preferences.
 */
export enum WeekStartDay {
  Unspecified = 'unspecified',
  Default = 'default',
  LocaleDefault = 'locale_default',
  Auto = 'auto',

  Sunday = 'sunday',
  Monday = 'monday',
  Tuesday = 'tuesday',
  Wednesday = 'wednesday',
  Thursday = 'thursday',
  Friday = 'friday',
  Saturday = 'saturday',

  ISO8601 = 'iso_8601',
}
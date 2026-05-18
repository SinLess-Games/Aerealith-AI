'use client';

import * as React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import type {
  ProfileCardFieldVisibility,
  ProfileCardLanguage,
  ProfileCardLinks,
  ProfileCardProfile,
} from './profile-card';
import type { ProfileEditOptions, ProfileSelectOption } from './types';

type EditableTextField =
  | 'handle'
  | 'displayName'
  | 'givenName'
  | 'middleName'
  | 'familyName'
  | 'pronouns'
  | 'avatarUrl'
  | 'bannerUrl'
  | 'bio'
  | 'locationLabel'
  | 'locale'
  | 'timezone'
  | 'websiteUrl';

type EditableSelectField =
  | 'status'
  | 'visibility'
  | 'country'
  | 'gender'
  | 'sex'
  | 'sexuality'
  | 'primaryLanguage'
  | 'timezoneUtc'
  | 'timezoneGreenwich'
  | 'weekStartDay'
  | 'dateFormat'
  | 'timeFormat'
  | 'nameDisplayOrder'
  | 'measurementSystem'
  | 'contentMaturity';

type LinkRow = { platform: string; url: string };
type LanguageRow = {
  language: string;
  proficiency: string;
  isPrimary: boolean;
};
type FieldVisibilityRow = { field: string; visibility: string };

type FormState = Record<EditableTextField | EditableSelectField, string> & {
  links: LinkRow[];
  languages: LanguageRow[];
  fieldVisibility: FieldVisibilityRow[];
};

type EditableFieldConfig = {
  key: EditableTextField | EditableSelectField | 'createdAt' | 'updatedAt';
  label: string;
  optionKey?: keyof ProfileEditOptions;
  readOnly?: boolean;
};

const profileEditableFields: EditableFieldConfig[] = [
  { key: 'givenName', label: 'First Name' },
  { key: 'middleName', label: 'Middle Name' },
  { key: 'familyName', label: 'Last Name' },
  { key: 'pronouns', label: 'Pronouns' },
  { key: 'locationLabel', label: 'Location' },
  { key: 'country', label: 'Country', optionKey: 'countries' },
  {
    key: 'primaryLanguage',
    label: 'Primary Language',
    optionKey: 'languages',
  },
  { key: 'locale', label: 'Locale' },
  { key: 'timezone', label: 'Timezone' },
  { key: 'timezoneUtc', label: 'UTC Offset', optionKey: 'timezoneUtc' },
  {
    key: 'timezoneGreenwich',
    label: 'GMT Offset',
    optionKey: 'timezoneGreenwich',
  },
  { key: 'gender', label: 'Gender', optionKey: 'genders' },
  { key: 'sex', label: 'Sex', optionKey: 'sexes' },
  { key: 'sexuality', label: 'Sexuality', optionKey: 'sexualities' },
  { key: 'createdAt', label: 'Created', readOnly: true },
  { key: 'updatedAt', label: 'Updated', readOnly: true },
];

const preferenceEditableFields: Array<
  EditableFieldConfig & {
    key: EditableSelectField;
    optionKey: keyof ProfileEditOptions;
  }
> = [
  { key: 'weekStartDay', label: 'Week Starts On', optionKey: 'weekStartDays' },
  { key: 'dateFormat', label: 'Date Format', optionKey: 'dateFormats' },
  { key: 'timeFormat', label: 'Time Format', optionKey: 'timeFormats' },
  {
    key: 'nameDisplayOrder',
    label: 'Name Display',
    optionKey: 'nameDisplayOrders',
  },
  {
    key: 'measurementSystem',
    label: 'Measurement System',
    optionKey: 'measurementSystems',
  },
  {
    key: 'contentMaturity',
    label: 'Content Maturity',
    optionKey: 'contentMaturity',
  },
];

const visibilityFields = [
  'displayName',
  'givenName',
  'middleName',
  'familyName',
  'pronouns',
  'avatarUrl',
  'bannerUrl',
  'bio',
  'locationLabel',
  'country',
  'gender',
  'sex',
  'sexuality',
  'primaryLanguage',
  'languages',
  'locale',
  'timezone',
  'timezoneUtc',
  'timezoneGreenwich',
  'weekStartDay',
  'dateFormat',
  'timeFormat',
  'nameDisplayOrder',
  'measurementSystem',
  'contentMaturity',
  'websiteUrl',
  'links',
  'createdAt',
  'updatedAt',
] as const;

const timezoneNames = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
  'UTC',
];

const scalarSelectFields: Array<{
  key: EditableSelectField;
  label: string;
  optionKey: keyof ProfileEditOptions;
}> = [
  { key: 'status', label: 'Profile status', optionKey: 'profileStatuses' },
  {
    key: 'visibility',
    label: 'Profile visibility',
    optionKey: 'profileVisibilities',
  },
  { key: 'country', label: 'Country', optionKey: 'countries' },
  { key: 'gender', label: 'Gender', optionKey: 'genders' },
  { key: 'sex', label: 'Sex', optionKey: 'sexes' },
  { key: 'sexuality', label: 'Sexuality', optionKey: 'sexualities' },
  {
    key: 'primaryLanguage',
    label: 'Primary language',
    optionKey: 'languages',
  },
  { key: 'timezoneUtc', label: 'UTC offset', optionKey: 'timezoneUtc' },
  {
    key: 'timezoneGreenwich',
    label: 'GMT offset',
    optionKey: 'timezoneGreenwich',
  },
  { key: 'weekStartDay', label: 'Week starts on', optionKey: 'weekStartDays' },
  { key: 'dateFormat', label: 'Date format', optionKey: 'dateFormats' },
  { key: 'timeFormat', label: 'Time format', optionKey: 'timeFormats' },
  {
    key: 'nameDisplayOrder',
    label: 'Name display order',
    optionKey: 'nameDisplayOrders',
  },
  {
    key: 'measurementSystem',
    label: 'Measurement system',
    optionKey: 'measurementSystems',
  },
  {
    key: 'contentMaturity',
    label: 'Content maturity',
    optionKey: 'contentMaturity',
  },
];

export type ProfileEditDialogProps = {
  open: boolean;
  profile: ProfileCardProfile;
  options?: ProfileEditOptions;
  onClose: () => void;
  onSave: (updates: Partial<ProfileCardProfile>) => Promise<void>;
};

function toRows(links?: ProfileCardLinks | null): LinkRow[] {
  return Object.entries(links ?? {}).map(([platform, url]) => ({
    platform,
    url: url ?? '',
  }));
}

function toLanguageRows(languages?: ProfileCardLanguage[] | null): LanguageRow[] {
  return (languages ?? []).map((item) => ({
    language: item.language,
    proficiency: item.proficiency ?? '',
    isPrimary: Boolean(item.isPrimary),
  }));
}

function toFieldVisibilityRows(
  fieldVisibility?: Partial<Record<string, ProfileCardFieldVisibility>> | null,
): FieldVisibilityRow[] {
  return visibilityFields.map((field) => ({
    field,
    visibility: fieldVisibility?.[field] ?? 'private',
  }));
}

function toFormState(profile: ProfileCardProfile): FormState {
  return {
    handle: profile.handle ?? '',
    displayName: profile.displayName ?? '',
    givenName: profile.givenName ?? '',
    middleName: profile.middleName ?? '',
    familyName: profile.familyName ?? '',
    pronouns: profile.pronouns ?? '',
    avatarUrl: profile.avatarUrl ?? '',
    bannerUrl: profile.bannerUrl ?? '',
    bio: profile.bio ?? '',
    locationLabel: profile.locationLabel ?? '',
    locale: profile.locale ?? '',
    timezone: profile.timezone ?? '',
    websiteUrl: profile.websiteUrl ?? '',
    status: profile.status ?? '',
    visibility: profile.visibility ?? '',
    country: profile.country ?? '',
    gender: profile.gender ?? '',
    sex: profile.sex ?? '',
    sexuality: profile.sexuality ?? '',
    primaryLanguage: profile.primaryLanguage ?? '',
    timezoneUtc: profile.timezoneUtc ?? '',
    timezoneGreenwich: profile.timezoneGreenwich ?? '',
    weekStartDay: profile.weekStartDay ?? '',
    dateFormat: profile.dateFormat ?? '',
    timeFormat: profile.timeFormat ?? '',
    nameDisplayOrder: profile.nameDisplayOrder ?? '',
    measurementSystem: profile.measurementSystem ?? '',
    contentMaturity: profile.contentMaturity ?? '',
    links: toRows(profile.links),
    languages: toLanguageRows(profile.languages),
    fieldVisibility: toFieldVisibilityRows(profile.fieldVisibility),
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function isValidUrl(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function hasOption(options: ProfileSelectOption[] | undefined, value: string): boolean {
  return value === '' || Boolean(options?.some((option) => option.value === value));
}

function getUtcOffset(timezone: string): string | null {
  if (!timezone.trim()) {
    return null;
  }

  try {
    const value = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;

    return value?.replace('GMT', 'UTC') ?? null;
  } catch {
    return null;
  }
}

function getTimezoneForUtcOffset(offset: string): string | null {
  return timezoneNames.find((timezone) => getUtcOffset(timezone) === offset) ?? null;
}

function getTimezoneLabel(timezone: string): string {
  try {
    return (
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'long',
      })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value ?? timezone
    );
  } catch {
    return timezone;
  }
}

function buildPayload(values: FormState): Partial<ProfileCardProfile> {
  const fieldVisibility = Object.fromEntries(
    values.fieldVisibility
      .filter(({ field, visibility }) => field.trim() && visibility.trim())
      .map(({ field, visibility }) => [field.trim(), visibility.trim()]),
  );
  const links = Object.fromEntries(
    values.links
      .filter(({ platform, url }) => platform.trim() && url.trim())
      .map(({ platform, url }) => [platform.trim(), url.trim()]),
  );
  const languages = values.languages
    .filter(({ language }) => language.trim())
    .map(({ language, proficiency, isPrimary }) => ({
      language: language.trim(),
      proficiency: nullable(proficiency) ?? undefined,
      isPrimary,
    }));

  return {
    handle: values.handle.trim(),
    displayName: nullable(values.displayName),
    givenName: nullable(values.givenName),
    middleName: nullable(values.middleName),
    familyName: nullable(values.familyName),
    pronouns: nullable(values.pronouns),
    avatarUrl: nullable(values.avatarUrl),
    bannerUrl: nullable(values.bannerUrl),
    bio: nullable(values.bio),
    status: nullable(values.status),
    visibility: nullable(values.visibility),
    fieldVisibility:
      Object.keys(fieldVisibility).length > 0
        ? (fieldVisibility as Partial<Record<string, ProfileCardFieldVisibility>>)
        : null,
    locationLabel: nullable(values.locationLabel),
    country: nullable(values.country),
    gender: nullable(values.gender),
    sex: nullable(values.sex),
    sexuality: nullable(values.sexuality),
    primaryLanguage: nullable(values.primaryLanguage),
    languages: languages.length > 0 ? languages : null,
    locale: nullable(values.locale),
    timezone: nullable(values.timezone),
    timezoneUtc: nullable(values.timezoneUtc),
    timezoneGreenwich: nullable(values.timezoneGreenwich),
    weekStartDay: nullable(values.weekStartDay),
    dateFormat: nullable(values.dateFormat),
    timeFormat: nullable(values.timeFormat),
    nameDisplayOrder: nullable(values.nameDisplayOrder),
    measurementSystem: nullable(values.measurementSystem),
    contentMaturity: nullable(values.contentMaturity),
    websiteUrl: nullable(values.websiteUrl),
    links: Object.keys(links).length > 0 ? links : null,
  };
}

function validate(values: FormState, options?: ProfileEditOptions): string[] {
  const errors: string[] = [];

  if (!values.handle.trim()) {
    errors.push('Handle is required.');
  }

  if (values.bio.length > 1000) {
    errors.push('Bio must be 1000 characters or fewer.');
  }

  for (const key of ['websiteUrl', 'avatarUrl', 'bannerUrl'] as const) {
    if (!isValidUrl(values[key])) {
      errors.push(`${key} must be a valid URL.`);
    }
  }

  for (const field of scalarSelectFields) {
    if (!hasOption(options?.[field.optionKey], values[field.key])) {
      errors.push(`${field.label} must use a supported value.`);
    }
  }

  values.links.forEach(({ platform, url }, index) => {
    if (!platform.trim() || !url.trim()) {
      errors.push(`Link ${index + 1} needs both a platform and URL.`);
    } else if (!isValidUrl(url)) {
      errors.push(`Link ${index + 1} must use a valid URL.`);
    } else if (!hasOption(options?.profileLinkPlatforms, platform)) {
      errors.push(`Link ${index + 1} must use a supported platform.`);
    }
  });

  values.languages.forEach(({ language, proficiency }, index) => {
    if (!language.trim()) {
      errors.push(`Language ${index + 1} needs a language.`);
    } else if (!hasOption(options?.languages, language)) {
      errors.push(`Language ${index + 1} must use a supported language.`);
    }

    if (!hasOption(options?.languageProficiencies, proficiency)) {
      errors.push(`Language ${index + 1} must use a supported proficiency.`);
    }
  });

  values.fieldVisibility.forEach(({ field, visibility }, index) => {
    if (!field.trim() || !visibility.trim()) {
      errors.push(`Field visibility ${index + 1} needs both values.`);
    } else if (!hasOption(options?.profileFieldVisibilities, visibility)) {
      errors.push(`Field visibility ${index + 1} must use a supported visibility.`);
    }
  });

  return errors;
}

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Typography fontWeight={800} sx={{ gridColumn: '1 / -1', mt: 1 }}>
      {children}
    </Typography>
  );
}

function getVisibilityValue(values: FormState, field: string): string {
  return values.fieldVisibility.find((item) => item.field === field)?.visibility ?? 'private';
}

function formatReadableDate(value: string | null | undefined): string {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

export function ProfileEditDialog({
  open,
  profile,
  options,
  onClose,
  onSave,
}: ProfileEditDialogProps): React.ReactElement {
  const [values, setValues] = React.useState(() => toFormState(profile));
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      setValues(toFormState(profile));
      setErrors([]);
    }
  }, [open, profile]);

  if (!open) {
    return <></>;
  }

  const handleSave = async (): Promise<void> => {
    const nextErrors = validate(values, options);

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    setErrors([]);

    try {
      await onSave(buildPayload(values));
      onClose();
    } catch {
      setErrors(['Unable to save profile changes.']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          pt: 1,
        }}
      >
        {profileEditableFields.map(({ key, label, optionKey, readOnly }) => (
          <Box
            key={key}
            sx={{
              display: 'grid',
              gap: 1,
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 180px' },
            }}
          >
            <TextField
              fullWidth
              label={label}
              onChange={(event) =>
                setValues((current) => {
                  if (key === 'createdAt' || key === 'updatedAt') {
                    return current;
                  }

                  const value = event.target.value;

                  if (key === 'timezone') {
                    const timezoneUtc = getUtcOffset(value) ?? current.timezoneUtc;

                    return {
                      ...current,
                      timezone: value,
                      timezoneUtc,
                      timezoneGreenwich: timezoneUtc.replace('UTC', 'GMT'),
                    };
                  }

                  if (key === 'timezoneUtc') {
                    const timezone = getTimezoneForUtcOffset(value) ?? current.timezone;

                    return {
                      ...current,
                      timezone,
                      timezoneUtc: value,
                      timezoneGreenwich: value.replace('UTC', 'GMT'),
                    };
                  }

                  if (key === 'timezoneGreenwich') {
                    const timezoneUtc = value.replace('GMT', 'UTC');
                    const timezone = getTimezoneForUtcOffset(timezoneUtc) ?? current.timezone;

                    return {
                      ...current,
                      timezone,
                      timezoneUtc,
                      timezoneGreenwich: value,
                    };
                  }

                  return { ...current, [key]: value };
                })
              }
              disabled={readOnly}
              select={Boolean(optionKey) || key === 'timezone'}
              size="small"
              value={
                key === 'createdAt' || key === 'updatedAt'
                  ? formatReadableDate(profile[key])
                  : values[key]
              }
            >
              {key === 'timezone'
                ? timezoneNames.map((timezone) => (
                    <MenuItem key={timezone} value={timezone}>
                      {getTimezoneLabel(timezone)}
                    </MenuItem>
                  ))
                : optionKey
                  ? [
                      <MenuItem key="not-set" value="">
                        Not set
                      </MenuItem>,
                      ...(options?.[optionKey] ?? []).map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      )),
                    ]
                  : null}
            </TextField>
            <TextField
              fullWidth
              label="Visibility"
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  fieldVisibility: current.fieldVisibility.map((item) =>
                    item.field === key
                      ? { ...item, visibility: event.target.value }
                      : item,
                  ),
                }))
              }
              select
              size="small"
              value={getVisibilityValue(values, key)}
            >
              {(options?.profileFieldVisibilities ?? []).map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        ))}

          <SectionTitle>Languages</SectionTitle>
          <Stack spacing={1.5} sx={{ gridColumn: '1 / -1' }}>
            {values.languages.map((language, index) => (
              <Box
                key={`${language.language}-${index}`}
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr auto auto' },
                }}
              >
                <TextField
                  label="Language"
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      languages: current.languages.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, language: event.target.value }
                          : item,
                      ),
                    }))
                  }
                  select
                  value={language.language}
                >
                  <MenuItem value="">Select language</MenuItem>
                  {(options?.languages ?? []).map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Proficiency"
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      languages: current.languages.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, proficiency: event.target.value }
                          : item,
                      ),
                    }))
                  }
                  select
                  value={language.proficiency}
                >
                  <MenuItem value="">Not set</MenuItem>
                  {(options?.languageProficiencies ?? []).map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={language.isPrimary}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          languages: current.languages.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, isPrimary: event.target.checked }
                              : item,
                          ),
                        }))
                      }
                    />
                  }
                  label="Primary"
                />
                <IconButton
                  aria-label="Remove language"
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      languages: current.languages.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  languages: [
                    ...current.languages,
                    { language: '', proficiency: '', isPrimary: false },
                  ],
                }))
              }
              startIcon={<AddIcon fontSize="small" />}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add language
            </Button>
          </Stack>

          <SectionTitle>Preferences</SectionTitle>
          {preferenceEditableFields.map(({ key, label, optionKey }) => (
            <Box
              key={key}
              sx={{
                display: 'grid',
                gap: 1,
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 180px' },
              }}
            >
              <TextField
                fullWidth
                label={label}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                select
                size="small"
                value={values[key]}
              >
                <MenuItem value="">Not set</MenuItem>
                {(options?.[optionKey ?? 'contentMaturity'] ?? []).map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                label="Visibility"
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    fieldVisibility: current.fieldVisibility.map((item) =>
                      item.field === key
                        ? { ...item, visibility: event.target.value }
                        : item,
                    ),
                  }))
                }
                select
                size="small"
                value={getVisibilityValue(values, key)}
              >
                {(options?.profileFieldVisibilities ?? []).map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          ))}

          <SectionTitle>Links</SectionTitle>
          <Stack spacing={1.5} sx={{ gridColumn: '1 / -1' }}>
            {values.links.map((link, index) => (
              <Box
                key={`${link.platform}-${index}`}
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: { xs: '1fr', md: '220px 1fr auto' },
                }}
              >
                <TextField
                  label="Platform"
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      links: current.links.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, platform: event.target.value }
                          : item,
                      ),
                    }))
                  }
                  select
                  value={link.platform}
                >
                  <MenuItem value="">Select platform</MenuItem>
                  {(options?.profileLinkPlatforms ?? []).map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="URL"
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      links: current.links.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, url: event.target.value } : item,
                      ),
                    }))
                  }
                  value={link.url}
                />
                <IconButton
                  aria-label="Remove link"
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      links: current.links.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  links: [...current.links, { platform: '', url: '' }],
                }))
              }
              startIcon={<AddIcon fontSize="small" />}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add link
            </Button>
          </Stack>

        </Box>
        {errors.length > 0 ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errors.join(' ')}
          </Alert>
        ) : null}
      <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button disabled={saving} onClick={handleSave} variant="contained">
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Stack>
    </Box>
  );
}

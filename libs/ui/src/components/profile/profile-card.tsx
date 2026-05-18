// libs/ui/src/components/profile/profile-card.tsx

'use client';

import * as React from 'react';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Divider,
  Link,
  Stack,
  Typography,
  type CardProps,
} from '@mui/material';

export type ProfileCardViewerAccess =
  | 'public'
  | 'connection'
  | 'organization'
  | 'owner';

export type ProfileCardVariant = 'compact' | 'default' | 'detailed';

export type ProfileCardFieldVisibility =
  | 'private'
  | 'public'
  | 'connections_only'
  | 'organization_only';

export type ProfileCardLanguage = {
  language: string;
  proficiency?: string;
  isPrimary?: boolean;
};

export type ProfileCardLinks = Record<string, string | null | undefined>;

export type ProfileCardProfile = {
  username?: string | null;
  handle: string;
  displayName?: string | null;
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  pronouns?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  status?: string | null;
  visibility?: string | null;
  fieldVisibility?: Partial<Record<string, ProfileCardFieldVisibility>> | null;
  locationLabel?: string | null;
  country?: string | null;
  gender?: string | null;
  sex?: string | null;
  sexuality?: string | null;
  primaryLanguage?: string | null;
  languages?: ProfileCardLanguage[] | null;
  locale?: string | null;
  timezone?: string | null;
  timezoneUtc?: string | null;
  timezoneGreenwich?: string | null;
  weekStartDay?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
  nameDisplayOrder?: string | null;
  measurementSystem?: string | null;
  contentMaturity?: string | null;
  websiteUrl?: string | null;
  links?: ProfileCardLinks | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProfileCardProps = Omit<CardProps, 'children' | 'variant'> & {
  profile: ProfileCardProfile;
  viewerAccess?: ProfileCardViewerAccess;
  variant?: ProfileCardVariant;
  showPrivateFields?: boolean;
  showSensitiveFields?: boolean;
  showPreferences?: boolean;
  maxLinks?: number;
  maxLanguages?: number;
  editLabel?: string;
  viewProfileLabel?: string;
  onEdit?: (profile: ProfileCardProfile) => void;
  onViewProfile?: (profile: ProfileCardProfile) => void;
  editing?: boolean;
  editor?: React.ReactNode;
};

type ProfileDisplayField = {
  key: keyof ProfileCardProfile;
  label: string;
  value?: string | null;
  sensitive?: boolean;
};

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatEnumLabel(value: string | null | undefined): string | undefined {
  if (!hasText(value)) {
    return undefined;
  }

  const trimmed = value.trim();

  if (/^[A-Z]{2}$/.test(trimmed)) {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(trimmed) ?? trimmed;
  }

  if (/^[a-z]{3}$/.test(trimmed)) {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(trimmed) ?? trimmed;
  }

  if (/^(UTC|GMT)[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/[yMdHhmsaSzZX]/.test(trimmed) && /[-/:. ]/.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatReadableDate(value: string | null | undefined): string | undefined {
  if (!hasText(value)) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return formatEnumLabel(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatTimezoneName(value: string | null | undefined): string | undefined {
  if (!hasText(value)) {
    return undefined;
  }

  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: value,
      timeZoneName: 'long',
    }).formatToParts(new Date());

    return parts.find((part) => part.type === 'timeZoneName')?.value ?? value;
  } catch {
    return formatEnumLabel(value);
  }
}

function getDisplayName(profile: ProfileCardProfile): string {
  if (hasText(profile.displayName)) {
    return profile.displayName.trim();
  }

  const parts = [
    profile.givenName,
    profile.middleName,
    profile.familyName,
  ].filter(hasText);

  if (parts.length > 0) {
    return parts.map((part) => part.trim()).join(' ');
  }

  return profile.handle;
}

function getInitials(profile: ProfileCardProfile): string {
  const displayName = getDisplayName(profile);
  const words = displayName
    .replace(/@/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return '?';
  }

  if (words.length === 1) {
    return words[0]?.slice(0, 2).toUpperCase() ?? '?';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();

  if (!trimmed) {
    return '@unknown';
  }

  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function canViewWholeProfile(
  profile: ProfileCardProfile,
  viewerAccess: ProfileCardViewerAccess,
  showPrivateFields: boolean,
): boolean {
  if (viewerAccess === 'owner' || showPrivateFields) {
    return true;
  }

  switch (profile.visibility) {
    case 'private':
      return false;
    case 'organization_only':
      return viewerAccess === 'organization';
    case 'connections_only':
      return viewerAccess === 'connection' || viewerAccess === 'organization';
    case 'public':
    case 'unlisted':
    default:
      return true;
  }
}

function canViewField(
  profile: ProfileCardProfile,
  key: string,
  viewerAccess: ProfileCardViewerAccess,
  showPrivateFields: boolean,
): boolean {
  if (viewerAccess === 'owner' || showPrivateFields) {
    return true;
  }

  const visibility = profile.fieldVisibility?.[key];

  switch (visibility) {
    case 'private':
      return false;
    case 'organization_only':
      return viewerAccess === 'organization';
    case 'connections_only':
      return viewerAccess === 'connection' || viewerAccess === 'organization';
    case 'public':
    case undefined:
    default:
      return true;
  }
}

function getSafeUrl(
  platform: string,
  value: string | null | undefined,
): string | undefined {
  if (!hasText(value)) {
    return undefined;
  }

  const trimmed = value.trim();
  const platformKey = platform.toLowerCase();

  if (platformKey === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return `mailto:${trimmed}`;
  }

  if (
    ['phone', 'sms'].includes(platformKey) &&
    /^[+()\-\s\d.]+$/.test(trimmed)
  ) {
    return platformKey === 'sms' ? `sms:${trimmed}` : `tel:${trimmed}`;
  }

  const withProtocol =
    /^[a-z][a-z\d+\-.]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);

    if (['http:', 'https:', 'mailto:', 'tel:', 'sms:'].includes(url.protocol)) {
      return url.href;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function getVisibleLinks(
  profile: ProfileCardProfile,
  maxLinks: number,
): Array<{ platform: string; url: string }> {
  const links = profile.links ?? {};
  const normalizedLinks = Object.entries(links)
    .map(([platform, value]) => ({
      platform,
      url: getSafeUrl(platform, value),
    }))
    .filter((link): link is { platform: string; url: string } =>
      Boolean(link.url),
    );

  const websiteUrl = getSafeUrl('website', profile.websiteUrl);
  const withWebsite = websiteUrl
    ? [{ platform: 'website', url: websiteUrl }, ...normalizedLinks]
    : normalizedLinks;

  const seen = new Set<string>();

  return withWebsite
    .filter((link) => {
      const key = `${link.platform}:${link.url}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, maxLinks);
}

function getLanguageLabel(language: ProfileCardLanguage): string {
  const name = formatEnumLabel(language.language) ?? language.language;
  const proficiency = formatEnumLabel(language.proficiency);

  if (proficiency && language.isPrimary) {
    return `${name} · ${proficiency} · Primary`;
  }

  if (proficiency) {
    return `${name} · ${proficiency}`;
  }

  if (language.isPrimary) {
    return `${name} · Primary`;
  }

  return name;
}

function ProfileInfoField({
  field,
  showEmpty = false,
}: {
  field: ProfileDisplayField;
  showEmpty?: boolean;
}): React.JSX.Element | null {
  const value = formatEnumLabel(field.value);

  if (!value && !showEmpty) {
    return null;
  }

  return (
    <Box>
      <Typography color="text.secondary" variant="caption">
        {field.label}
      </Typography>
      <Typography variant="body2">{value ?? 'Not set'}</Typography>
    </Box>
  );
}

export function ProfileCard({
  profile,
  viewerAccess = 'public',
  variant = 'default',
  showPrivateFields = false,
  showSensitiveFields = false,
  showPreferences = false,
  maxLinks = 6,
  maxLanguages = 5,
  editLabel = 'Edit profile',
  viewProfileLabel = 'View profile',
  onEdit,
  onViewProfile,
  editing = false,
  editor,
  sx,
  ...cardProps
}: ProfileCardProps): React.JSX.Element {
  const displayName = getDisplayName(profile);
  const handle = normalizeHandle(profile.handle);
  const initials = getInitials(profile);
  const canViewProfile = canViewWholeProfile(
    profile,
    viewerAccess,
    showPrivateFields,
  );

  const links = React.useMemo(
    () => getVisibleLinks(profile, maxLinks),
    [maxLinks, profile],
  );

  const visibleLanguages = React.useMemo(
    () => (profile.languages ?? []).slice(0, maxLanguages),
    [maxLanguages, profile.languages],
  );

  const profileFields: ProfileDisplayField[] = [
    { key: 'givenName', label: 'First Name', value: profile.givenName },
    { key: 'middleName', label: 'Middle Name', value: profile.middleName },
    { key: 'familyName', label: 'Last Name', value: profile.familyName },
    { key: 'pronouns', label: 'Pronouns', value: profile.pronouns },
    { key: 'locationLabel', label: 'Location', value: profile.locationLabel },
    { key: 'country', label: 'Country', value: profile.country },
    {
      key: 'primaryLanguage',
      label: 'Primary Language',
      value: profile.primaryLanguage,
    },
    { key: 'locale', label: 'Locale', value: profile.locale },
    { key: 'timezone', label: 'Timezone', value: formatTimezoneName(profile.timezone) },
    { key: 'timezoneUtc', label: 'UTC Offset', value: profile.timezoneUtc },
    {
      key: 'timezoneGreenwich',
      label: 'GMT Offset',
      value: profile.timezoneGreenwich,
    },
    { key: 'gender', label: 'Gender', value: profile.gender, sensitive: true },
    { key: 'sex', label: 'Sex', value: profile.sex, sensitive: true },
    {
      key: 'sexuality',
      label: 'Sexuality',
      value: profile.sexuality,
      sensitive: true,
    },
    { key: 'createdAt', label: 'Created', value: formatReadableDate(profile.createdAt) },
    { key: 'updatedAt', label: 'Updated', value: formatReadableDate(profile.updatedAt) },
  ];

  const preferenceFields: ProfileDisplayField[] = [
    {
      key: 'weekStartDay',
      label: 'Week Starts On',
      value: profile.weekStartDay,
    },
    { key: 'dateFormat', label: 'Date Format', value: profile.dateFormat },
    { key: 'timeFormat', label: 'Time Format', value: profile.timeFormat },
    {
      key: 'nameDisplayOrder',
      label: 'Name Display',
      value: profile.nameDisplayOrder,
    },
    {
      key: 'measurementSystem',
      label: 'Measurement System',
      value: profile.measurementSystem,
    },
    {
      key: 'contentMaturity',
      label: 'Content Maturity',
      value: profile.contentMaturity,
    },
  ];

  const showEmptyFields = viewerAccess === 'owner' || showPrivateFields;

  const visibleProfileFields = profileFields.filter((field) => {
    if (field.sensitive && !showSensitiveFields && viewerAccess !== 'owner') {
      return false;
    }

    return (
      canViewField(profile, field.key, viewerAccess, showPrivateFields) &&
      (showEmptyFields || hasText(field.value))
    );
  });

  const visiblePreferenceFields = preferenceFields.filter(
    (field) =>
      canViewField(profile, field.key, viewerAccess, showPrivateFields) &&
      (showEmptyFields || hasText(field.value)),
  );

  if (!canViewProfile) {
    return (
      <Card
        {...cardProps}
        sx={{
          borderRadius: 4,
          border: 1,
          borderColor: 'divider',
          boxShadow: 'none',
          ...sx,
        }}
      >
        <CardContent>
          <Stack alignItems="center" spacing={2} textAlign="center">
            <Avatar>{initials}</Avatar>
            <Box>
              <Typography fontWeight={700} variant="h6">
                Private profile
              </Typography>
              <Typography color="text.secondary" variant="body2">
                This profile is not visible to your current access level.
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      {...cardProps}
      sx={{
        overflow: 'hidden',
        borderRadius: 4,
        border: 1,
        borderColor: 'divider',
        boxShadow: '0 18px 45px rgba(15, 23, 42, 0.12)',
        ...sx,
      }}
    >
      {variant !== 'compact' && (
        <Box
          sx={{
            position: 'relative',
            height: { xs: 112, sm: 148 },
            bgcolor: 'primary.main',
            background:
              'radial-gradient(circle at top left, rgba(255,255,255,0.35), transparent 34%), linear-gradient(135deg, rgba(25,118,210,1), rgba(103,58,183,1))',
          }}
        >
          {hasText(profile.bannerUrl) && (
            <Box
              alt=""
              component="img"
              src={profile.bannerUrl}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          )}
        </Box>
      )}

      <CardContent
        sx={{
          pt: variant === 'compact' ? 3 : 0,
        }}
      >
        <Stack
          alignItems={variant === 'compact' ? 'center' : 'flex-start'}
          direction={
            variant === 'compact' ? 'column' : { xs: 'column', sm: 'row' }
          }
          spacing={2}
          sx={{
            mt: variant === 'compact' ? 0 : -5,
            position: 'relative',
          }}
        >
          <Avatar
            alt={displayName}
            src={profile.avatarUrl ?? undefined}
            sx={{
              width: variant === 'compact' ? 72 : 104,
              height: variant === 'compact' ? 72 : 104,
              border: 4,
              borderColor: 'background.paper',
              bgcolor: 'primary.dark',
              fontSize: variant === 'compact' ? 24 : 34,
              fontWeight: 800,
            }}
          >
            {initials}
          </Avatar>

          <Stack
            spacing={1}
            sx={{
              flex: 1,
              minWidth: 0,
              pt: variant === 'compact' ? 0 : { xs: 0, sm: 5.5 },
              textAlign: variant === 'compact' ? 'center' : 'left',
            }}
          >
            <Box>
              <Typography
                component="h2"
                fontWeight={800}
                lineHeight={1.1}
                variant={variant === 'compact' ? 'h6' : 'h5'}
              >
                {displayName}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {handle}
              </Typography>
            </Box>

            <Stack
              direction="row"
              flexWrap="wrap"
              justifyContent={variant === 'compact' ? 'center' : 'flex-start'}
              spacing={1}
              useFlexGap
            >
              {hasText(profile.pronouns) &&
                canViewField(
                  profile,
                  'pronouns',
                  viewerAccess,
                  showPrivateFields,
                ) && <Chip label={profile.pronouns} size="small" />}

              {hasText(profile.status) && viewerAccess === 'owner' && (
                <Chip
                  color={profile.status === 'active' ? 'success' : 'default'}
                  label={formatEnumLabel(profile.status)}
                  size="small"
                  variant="outlined"
                />
              )}

              {hasText(profile.visibility) && viewerAccess === 'owner' && (
                <Chip
                  label={formatEnumLabel(profile.visibility)}
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>
          </Stack>
        </Stack>

        {hasText(profile.bio) &&
          canViewField(profile, 'bio', viewerAccess, showPrivateFields) && (
            <Typography
              color="text.secondary"
              sx={{ mt: 2, whiteSpace: 'pre-line' }}
              variant="body2"
            >
              {profile.bio}
            </Typography>
          )}

        {editing && editor}

        {!editing && visibleProfileFields.length > 0 && variant !== 'compact' && (
          <>
            <Divider sx={{ my: 2.5 }} />
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                },
              }}
            >
              {visibleProfileFields.map((field) => (
                <ProfileInfoField
                  field={field}
                  key={field.key}
                  showEmpty={showEmptyFields}
                />
              ))}
            </Box>
          </>
        )}

        {!editing &&
          visibleLanguages.length > 0 &&
          variant !== 'compact' &&
          canViewField(profile, 'languages', viewerAccess, showPrivateFields) && (
            <>
              <Divider sx={{ my: 2.5 }} />
              <Box>
                <Typography fontWeight={700} gutterBottom variant="subtitle2">
                  Languages
                </Typography>
                <Stack direction="row" flexWrap="wrap" spacing={1} useFlexGap>
                  {visibleLanguages.map((language, index) => (
                    <Chip
                      key={`${language.language}-${language.proficiency ?? 'unknown'}-${index}`}
                      label={getLanguageLabel(language)}
                      size="small"
                      variant={language.isPrimary ? 'filled' : 'outlined'}
                    />
                  ))}
                </Stack>
              </Box>
            </>
          )}

        {!editing &&
          showPreferences &&
          visiblePreferenceFields.length > 0 &&
          variant === 'detailed' && (
            <>
              <Divider sx={{ my: 2.5 }} />
              <Box>
                <Typography fontWeight={700} gutterBottom variant="subtitle2">
                  Preferences
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: 'repeat(2, minmax(0, 1fr))',
                    },
                  }}
                >
                  {visiblePreferenceFields.map((field) => (
                    <ProfileInfoField
                      field={field}
                      key={field.key}
                      showEmpty={showEmptyFields}
                    />
                  ))}
                </Box>
              </Box>
            </>
          )}

        {!editing &&
          links.length > 0 &&
          variant !== 'compact' &&
          canViewField(profile, 'links', viewerAccess, showPrivateFields) && (
            <>
              <Divider sx={{ my: 2.5 }} />
              <Box>
                <Typography fontWeight={700} gutterBottom variant="subtitle2">
                  Links
                </Typography>
                <Stack direction="row" flexWrap="wrap" spacing={1} useFlexGap>
                  {links.map((link) => (
                    <Chip
                      clickable
                      component={Link}
                      href={link.url}
                      key={`${link.platform}-${link.url}`}
                      label={formatEnumLabel(link.platform)}
                      rel="noopener noreferrer"
                      size="small"
                      target="_blank"
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Box>
            </>
          )}

      </CardContent>

      {(onEdit || onViewProfile) && (
        <CardActions
          sx={{
            px: 2,
            pb: 2,
            pt: 0,
            justifyContent: variant === 'compact' ? 'center' : 'flex-end',
          }}
        >
          {onViewProfile && (
            <Button onClick={() => onViewProfile(profile)} size="small">
              {viewProfileLabel}
            </Button>
          )}

          {onEdit && viewerAccess === 'owner' && (
            <Button
              onClick={() => onEdit(profile)}
              size="small"
              variant="contained"
            >
              {editLabel}
            </Button>
          )}
        </CardActions>
      )}
    </Card>
  );
}

export default ProfileCard;

// libs/ui/src/components/profile/index.tsx

'use client';

import * as React from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

import type {
  PrivateUserProfileDashboardDto,
  PublicUserProfileDto,
  UserAchievementDto,
  UserActivityEventDto,
  UserAppConnectionDto,
  UserFileReferenceDto,
  UserIntegrationDto,
  UserReportDto,
} from '@aerealith-ai/contracts';

import { GlassCard } from '../cards';

type ProfileFeatureFlags = Partial<
  Record<
    | 'profile-app-connections'
    | 'profile-integrations'
    | 'profile-files'
    | 'profile-reports'
    | 'profile-achievements',
    boolean
  >
>;

type UnknownRecord = Record<string, unknown>;

export type ProfileDashboardProps =
  | {
      mode: 'public';
      data: PublicUserProfileDto;
      flags?: ProfileFeatureFlags;
    }
  | {
      mode: 'private';
      data: PrivateUserProfileDashboardDto;
      flags?: ProfileFeatureFlags;
    };

const panelSx = {
  borderRadius: 2,
  border: '1px solid rgba(167, 139, 250, 0.22)',
  background:
    'linear-gradient(145deg, rgba(9, 13, 30, 0.92), rgba(18, 17, 42, 0.78))',
};

function asRecord(value: unknown): UnknownRecord {
  if (typeof value === 'object' && value !== null) {
    return value as UnknownRecord;
  }

  return {};
}

function getStringField(value: unknown, key: string): string | undefined {
  const fieldValue = asRecord(value)[key];

  if (typeof fieldValue !== 'string') {
    return undefined;
  }

  const trimmedValue = fieldValue.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function getNullableStringField(value: unknown, key: string): string | null {
  return getStringField(value, key) ?? null;
}

function displayValue(value: unknown, fallback = 'Unavailable'): string {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : fallback;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

export function ProfileDashboard(
  props: ProfileDashboardProps,
): React.ReactElement {
  const { data, mode } = props;
  const flags = props.flags ?? {};
  const profile = data.profile;
  const isPrivate = mode === 'private';

  const profileDisplayName =
    getStringField(profile, 'displayName') ??
    getStringField(profile, 'username') ??
    getStringField(profile, 'handle') ??
    'Aerealith User';

  const profileHandle =
    getStringField(profile, 'handle') ??
    getStringField(profile, 'username') ??
    'member';

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        bgcolor: '#050816',
        color: '#f8fbff',
        backgroundImage:
          'radial-gradient(circle at 12% 12%, rgba(168,85,247,.18), transparent 32%), radial-gradient(circle at 88% 16%, rgba(6,182,212,.2), transparent 34%)',
        p: { xs: 2, md: 3 },
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: isPrivate ? '236px minmax(0, 1fr)' : 'minmax(0, 1fr)',
          },
          gap: 3,
          maxWidth: 1560,
          mx: 'auto',
        }}
      >
        {isPrivate ? <ProfileSidebar /> : null}

        <Stack spacing={2.5}>
          <ProfileHeader
            avatarUrl={getNullableStringField(profile, 'avatarUrl')}
            bannerUrl={getNullableStringField(profile, 'bannerUrl')}
            bio={getNullableStringField(profile, 'bio')}
            displayName={profileDisplayName}
            handle={profileHandle}
            joined={getStringField(profile, 'createdAt')}
            location={getNullableStringField(profile, 'locationLabel')}
            mode={mode}
            stats={data.stats}
          />

          {mode === 'public' ? (
            <PermissionNotice text="This public profile only includes information the owner has made visible." />
          ) : (
            <PermissionNotice text="Private dashboard data is visible only to the signed-in account owner." />
          )}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(2, minmax(0, 1fr))',
                xl: 'repeat(3, minmax(0, 1fr))',
              },
              gap: 2,
            }}
          >
            {isPrivate && flags['profile-app-connections'] !== false ? (
              <AppConnectionsPanel items={data.appConnections} />
            ) : null}

            {isPrivate && flags['profile-integrations'] !== false ? (
              <IntegrationsPanel items={data.integrations} />
            ) : null}

            {flags['profile-files'] !== false ? (
              <FilesPanel items={data.files} />
            ) : null}

            {flags['profile-reports'] !== false ? (
              <ReportsPanel items={data.reports} />
            ) : null}

            {flags['profile-achievements'] !== false ? (
              <AchievementsPanel
                items={data.achievements}
                totalPoints={data.stats.totalPoints}
              />
            ) : null}

            {isPrivate ? <ActivityPanel items={data.activity} /> : null}
            {isPrivate ? <SettingsPanel profile={data.profile} /> : null}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

export function ProfileLoadingSkeleton(): React.ReactElement {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#050816', p: 3 }}>
      <Stack spacing={2}>
        <Skeleton
          variant="rounded"
          height={260}
          sx={{ bgcolor: 'rgba(255,255,255,.08)' }}
        />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {[0, 1, 2].map((item) => (
            <Skeleton
              key={item}
              variant="rounded"
              height={260}
              sx={{ bgcolor: 'rgba(255,255,255,.08)' }}
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}

export function ProfileErrorState({
  message,
}: {
  message: string;
}): React.ReactElement {
  return (
    <Box
      component="main"
      sx={{ minHeight: '100vh', bgcolor: '#050816', color: '#fff', p: 3 }}
    >
      <GlassCard padding="comfortable" radius="md" glow>
        <Typography component="h1" variant="h5">
          Profile unavailable
        </Typography>

        <Typography sx={{ mt: 1, color: 'rgba(248,251,255,.72)' }}>
          {message}
        </Typography>
      </GlassCard>
    </Box>
  );
}

function ProfileSidebar(): React.ReactElement {
  const navItems = [
    'Overview',
    'Connections',
    'Integrations',
    'Files',
    'Reports',
    'Achievements',
    'Settings',
  ];

  return (
    <Box
      component="nav"
      aria-label="Profile sections"
      sx={{ display: { xs: 'none', lg: 'block' } }}
    >
      <Stack spacing={2} sx={{ position: 'sticky', top: 24 }}>
        <Typography
          variant="overline"
          sx={{ color: '#c4b5fd', letterSpacing: 1 }}
        >
          Aerealith AI
        </Typography>

        {navItems.map((item) => (
          <Button
            key={item}
            href={`#${item.toLowerCase()}`}
            sx={{ justifyContent: 'flex-start', color: '#dbeafe' }}
          >
            {item}
          </Button>
        ))}
      </Stack>
    </Box>
  );
}

function ProfileHeader(props: {
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  displayName: string;
  handle: string;
  joined?: string | null;
  location?: string | null;
  mode: 'public' | 'private';
  stats: {
    achievements: number;
    appConnections: number;
    files: number;
    integrations: number;
    reports: number;
    totalPoints: number;
  };
}): React.ReactElement {
  return (
    <GlassCard padding="none" radius="md" glow sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          minHeight: 282,
          p: { xs: 2.5, md: 4 },
          backgroundImage: props.bannerUrl
            ? `linear-gradient(90deg, rgba(5,8,22,.95), rgba(5,8,22,.38)), url(${props.bannerUrl})`
            : 'linear-gradient(120deg, rgba(88,28,135,.36), rgba(14,165,233,.2) 48%, rgba(236,72,153,.22))',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          alignItems={{ md: 'center' }}
        >
          <Box
            aria-label={`${props.displayName} avatar`}
            sx={{
              width: 136,
              height: 136,
              borderRadius: '50%',
              border: '1px solid rgba(34,211,238,.5)',
              backgroundImage: props.avatarUrl
                ? `url(${props.avatarUrl})`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              bgcolor: alpha('#8b5cf6', 0.18),
              display: 'grid',
              placeItems: 'center',
              fontSize: 42,
              fontWeight: 800,
            }}
          >
            {props.avatarUrl
              ? null
              : props.displayName.slice(0, 2).toUpperCase()}
          </Box>

          <Stack spacing={1} sx={{ flex: 1 }}>
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{ flexWrap: 'wrap' }}
            >
              <Typography
                component="h1"
                variant="h3"
                sx={{ fontSize: { xs: 32, md: 42 }, fontWeight: 800 }}
              >
                {props.displayName}
              </Typography>

              <Chip
                label={
                  props.mode === 'private'
                    ? 'Private dashboard'
                    : 'Public profile'
                }
                size="small"
                sx={{ color: '#e9d5ff', borderColor: '#7c3aed' }}
                variant="outlined"
              />
            </Stack>

            <Typography sx={{ color: '#cbd5e1' }}>@{props.handle}</Typography>

            {props.location ? (
              <Typography sx={{ color: '#cbd5e1' }}>
                {props.location}
              </Typography>
            ) : null}

            <Typography sx={{ color: '#cbd5e1' }}>
              Member since {formatDate(props.joined)}
            </Typography>

            {props.bio ? (
              <Typography sx={{ maxWidth: 720, color: '#f8fafc' }}>
                {props.bio}
              </Typography>
            ) : null}
          </Stack>
        </Stack>

        <Box
          sx={{
            mt: 4,
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(6, 1fr)' },
            gap: 1.5,
          }}
        >
          <Stat label="Achievements" value={props.stats.achievements} />
          <Stat label="Points" value={props.stats.totalPoints} />
          <Stat label="Files" value={props.stats.files} />
          <Stat label="Reports" value={props.stats.reports} />
          <Stat label="Apps" value={props.stats.appConnections} />
          <Stat label="Integrations" value={props.stats.integrations} />
        </Box>
      </Box>
    </GlassCard>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.ReactElement {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        bgcolor: 'rgba(15,23,42,.66)',
        border: '1px solid rgba(148,163,184,.18)',
      }}
    >
      <Typography sx={{ fontSize: 24, fontWeight: 800 }}>
        {value.toLocaleString()}
      </Typography>

      <Typography sx={{ color: '#cbd5e1', fontSize: 13 }}>{label}</Typography>
    </Box>
  );
}

function Panel({
  id,
  title,
  children,
  empty,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  empty: boolean;
}): React.ReactElement {
  return (
    <Box id={id} component="section" sx={panelSx}>
      <Stack spacing={1.5} sx={{ p: 2 }}>
        <Typography component="h2" variant="h6">
          {title}
        </Typography>

        {empty ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} />
        ) : (
          children
        )}
      </Stack>
    </Box>
  );
}

function AppConnectionsPanel({
  items,
}: {
  items: UserAppConnectionDto[];
}): React.ReactElement {
  return (
    <Panel id="connections" title="App Connections" empty={items.length === 0}>
      {items.map((item) => (
        <Row
          key={item.id}
          title={displayValue(item.displayName)}
          detail={displayValue(
            item.connectedAccountIdentifier ?? item.provider,
          )}
          badge={displayValue(item.status)}
        />
      ))}
    </Panel>
  );
}

function IntegrationsPanel({
  items,
}: {
  items: UserIntegrationDto[];
}): React.ReactElement {
  return (
    <Panel id="integrations" title="Integrations" empty={items.length === 0}>
      {items.map((item) => (
        <Row
          key={item.id}
          title={displayValue(item.displayName)}
          detail={displayValue(item.description ?? item.provider)}
          badge={displayValue(item.enabled ? item.status : 'disabled')}
        />
      ))}
    </Panel>
  );
}

function FilesPanel({
  items,
}: {
  items: UserFileReferenceDto[];
}): React.ReactElement {
  return (
    <Panel id="files" title="Files" empty={items.length === 0}>
      {items.map((item) => (
        <Row
          key={item.id}
          title={displayValue(item.name)}
          detail={formatBytes(item.sizeBytes)}
          badge={displayValue(item.visibility)}
        />
      ))}
    </Panel>
  );
}

function ReportsPanel({
  items,
}: {
  items: UserReportDto[];
}): React.ReactElement {
  return (
    <Panel id="reports" title="Reports" empty={items.length === 0}>
      {items.map((item) => (
        <Row
          key={item.id}
          title={displayValue(item.title)}
          detail={formatDate(item.generatedAt)}
          badge={displayValue(item.type).replaceAll('_', ' ')}
        />
      ))}
    </Panel>
  );
}

function AchievementsPanel({
  items,
  totalPoints,
}: {
  items: UserAchievementDto[];
  totalPoints: number;
}): React.ReactElement {
  return (
    <Panel id="achievements" title="Achievements" empty={items.length === 0}>
      <Typography sx={{ color: '#c4b5fd', fontWeight: 700 }}>
        {totalPoints.toLocaleString()} total points
      </Typography>

      {items.map((item) => (
        <Box key={item.id} sx={{ py: 1 }}>
          <Row
            title={displayValue(item.title)}
            detail={`${item.points} points`}
            badge={item.unlocked ? 'unlocked' : 'in progress'}
          />

          <LinearProgress
            variant="determinate"
            value={item.progress.percentage}
            sx={{ mt: 1, bgcolor: 'rgba(148,163,184,.18)' }}
          />
        </Box>
      ))}
    </Panel>
  );
}

function ActivityPanel({
  items,
}: {
  items: UserActivityEventDto[];
}): React.ReactElement {
  return (
    <Panel id="activity" title="Recent Activity" empty={items.length === 0}>
      {items.map((item) => (
        <Row
          key={item.id}
          title={displayValue(item.title)}
          detail={displayValue(item.description ?? formatDate(item.createdAt))}
          badge={displayValue(item.type)}
        />
      ))}
    </Panel>
  );
}

type EditableProfileField =
  | 'displayName'
  | 'handle'
  | 'bio'
  | 'locationLabel'
  | 'websiteUrl'
  | 'visibility';

type EditableProfileForm = Record<EditableProfileField, string>;

function createEditableProfileForm(profile: unknown): EditableProfileForm {
  return {
    displayName: getStringField(profile, 'displayName') ?? '',
    handle:
      getStringField(profile, 'handle') ??
      getStringField(profile, 'username') ??
      '',
    bio: getStringField(profile, 'bio') ?? '',
    locationLabel: getStringField(profile, 'locationLabel') ?? '',
    websiteUrl: getStringField(profile, 'websiteUrl') ?? '',
    visibility: getStringField(profile, 'visibility') ?? 'private',
  };
}

function getProfileIdentifier(profile: unknown): string | undefined {
  return (
    getStringField(profile, 'username') ??
    getStringField(profile, 'handle') ??
    getStringField(profile, 'userId') ??
    getStringField(profile, 'id')
  );
}

function nullableValue(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function SettingsPanel({
  profile,
}: {
  profile: unknown;
}): React.ReactElement {
  const [form, setForm] = React.useState<EditableProfileForm>(() =>
    createEditableProfileForm(profile),
  );
  const [status, setStatus] = React.useState<
    { type: 'success' | 'error'; message: string } | undefined
  >();
  const [isSaving, setIsSaving] = React.useState(false);

  const updateField =
    (field: EditableProfileField) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(undefined);
    setIsSaving(true);

    try {
      const profileIdentifier = getProfileIdentifier(profile);

      if (!profileIdentifier) {
        throw new Error('Unable to determine which profile should be saved.');
      }

      const response = await fetch(
        `/api/V1/users/${encodeURIComponent(profileIdentifier)}/profile`,
        {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            displayName: form.displayName.trim(),
            handle: form.handle.trim(),
            bio: nullableValue(form.bio),
            locationLabel: nullableValue(form.locationLabel),
            websiteUrl: nullableValue(form.websiteUrl),
            visibility: form.visibility,
          }),
        },
      );

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: { message?: string } }
        | null;

      if (!response.ok || body?.ok === false) {
        throw new Error(
          body?.error?.message ?? 'Unable to save profile changes.',
        );
      }

      setStatus({ type: 'success', message: 'Profile saved.' });
      window.location.reload();
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to save profile changes.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel id="settings" title="Account & Settings" empty={false}>
      <Box component="form" onSubmit={saveProfile}>
        <Stack spacing={1.5}>
          {status ? (
            <Alert severity={status.type} variant="outlined">
              {status.message}
            </Alert>
          ) : null}

          <TextField
            label="Display name"
            value={form.displayName}
            onChange={updateField('displayName')}
            required
            size="small"
          />

          <TextField
            label="Handle"
            value={form.handle}
            onChange={updateField('handle')}
            required
            size="small"
          />

          <TextField
            label="Bio"
            value={form.bio}
            onChange={updateField('bio')}
            multiline
            minRows={3}
            size="small"
          />

          <TextField
            label="Location"
            value={form.locationLabel}
            onChange={updateField('locationLabel')}
            size="small"
          />

          <TextField
            label="Website"
            value={form.websiteUrl}
            onChange={updateField('websiteUrl')}
            size="small"
          />

          <TextField
            label="Visibility"
            value={form.visibility}
            onChange={updateField('visibility')}
            select
            size="small"
          >
            <MenuItem value="private">Private</MenuItem>
            <MenuItem value="public">Public</MenuItem>
          </TextField>

          <Button
            disabled={isSaving}
            type="submit"
            variant="contained"
            sx={{ alignSelf: 'flex-start' }}
          >
            {isSaving ? 'Saving...' : 'Save profile'}
          </Button>
        </Stack>
      </Box>
    </Panel>
  );
}

function Row({
  title,
  detail,
  badge,
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  badge?: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
            {title}
          </Typography>

          {detail ? (
            <Typography
              sx={{ color: '#94a3b8', fontSize: 13, overflowWrap: 'anywhere' }}
            >
              {detail}
            </Typography>
          ) : null}
        </Box>

        {badge ? (
          <Chip
            label={badge}
            size="small"
            sx={{ color: '#86efac', bgcolor: 'rgba(22,163,74,.12)' }}
          />
        ) : null}
      </Stack>

      <Divider sx={{ borderColor: 'rgba(148,163,184,.14)' }} />
    </>
  );
}

function EmptyState({ title }: { title: string }): React.ReactElement {
  return (
    <Box sx={{ py: 4, textAlign: 'center', color: '#94a3b8' }}>
      <Typography>{title}</Typography>
    </Box>
  );
}

function PermissionNotice({ text }: { text: string }): React.ReactElement {
  return (
    <Box
      role="note"
      sx={{
        px: 2,
        py: 1.25,
        borderRadius: 2,
        color: '#dbeafe',
        border: '1px solid rgba(34,211,238,.24)',
        bgcolor: 'rgba(14,165,233,.08)',
      }}
    >
      {text}
    </Box>
  );
}

function formatDate(value: unknown): string {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    !(value instanceof Date)
  ) {
    return 'Not generated';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not generated';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatBytes(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 'Size unavailable';
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

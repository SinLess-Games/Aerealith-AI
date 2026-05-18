'use client';

import * as React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
  type CardProps,
} from '@mui/material';
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
  UserSettingsPatch,
} from '@helix-ai/db';

export const settingsSectionKeys = [
  'accessibility',
  'account',
  'ai',
  'appearance',
  'communication',
  'content',
  'developer',
  'integrations',
  'localization',
  'memory',
  'notifications',
  'privacy',
  'security',
] as const;

export type SettingsSectionKey = (typeof settingsSectionKeys)[number];

export type SettingsSectionValueMap = {
  accessibility: AccessibilityUserSettings;
  account: AccountUserSettings;
  ai: AiUserSettings;
  appearance: AppearanceUserSettings;
  communication: CommunicationUserSettings;
  content: ContentUserSettings;
  developer: DeveloperUserSettings;
  integrations: IntegrationUserSettings;
  localization: LocalizationUserSettings;
  memory: MemoryUserSettings;
  notifications: NotificationUserSettings;
  privacy: PrivacyUserSettings;
  security: SecurityUserSettings;
};

export type SettingsSectionValue = SettingsSectionValueMap[SettingsSectionKey];

export type SettingsCardSettings = SettingsSectionValueMap & {
  id: string;
  userId: string;
  username: string;
  metadata: UserSettingsMetadata;
  createdAt: string;
  updatedAt: string;
};

export type SettingsCardProps = Omit<CardProps, 'children'> & {
  settings: SettingsCardSettings;
  editing?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  onSave?: (updates: UserSettingsPatch) => Promise<void>;
};

export type SettingsCardUpdates = UserSettingsPatch;

type SettingsDraft = Pick<SettingsCardSettings, SettingsSectionKey>;
type SettingsPath = readonly string[];
type FieldKind = 'select' | 'boolean' | 'text' | 'number';

type SettingsFieldDefinition = {
  label: string;
  path: SettingsPath;
  kind: FieldKind;
  options?: readonly string[];
};

type SettingsSectionDefinition = {
  label: string;
  description: string;
  fields: readonly SettingsFieldDefinition[];
};

const preferenceModes = ['system', 'enabled', 'disabled'] as const;

const sectionDefinitions: Record<SettingsSectionKey, SettingsSectionDefinition> = {
  accessibility: {
    label: 'Accessibility',
    description: 'Reading, motion, and assistive preferences.',
    fields: [
      { label: 'Color Scheme', path: ['visual', 'colorScheme'], kind: 'select', options: ['system', 'light', 'dark', 'high_contrast_light', 'high_contrast_dark'] },
      { label: 'Font Scale', path: ['visual', 'fontScale'], kind: 'select', options: ['system', 'small', 'normal', 'large', 'larger', 'largest'] },
      { label: 'Reduced Motion', path: ['motion', 'reducedMotion'], kind: 'select', options: ['system', 'no_preference', 'reduce', 'remove'] },
      { label: 'Captions', path: ['media', 'captions'], kind: 'select', options: preferenceModes },
    ],
  },
  account: {
    label: 'Account',
    description: 'Onboarding and account communication preferences.',
    fields: [
      { label: 'Mode', path: ['mode'], kind: 'select', options: preferenceModes },
      { label: 'Show Welcome Tips', path: ['onboarding', 'showWelcomeTips'], kind: 'boolean' },
      { label: 'Product Updates', path: ['contact', 'allowProductUpdates'], kind: 'boolean' },
      { label: 'Self-Service Export', path: ['data', 'allowSelfServiceExport'], kind: 'boolean' },
    ],
  },
  ai: {
    label: 'AI',
    description: 'Assistant behavior and response defaults.',
    fields: [
      { label: 'Tone', path: ['behavior', 'tone'], kind: 'select', options: ['system_default', 'professional', 'friendly', 'casual', 'technical', 'mentor', 'coach', 'direct', 'supportive'] },
      { label: 'Personality', path: ['behavior', 'personalityMode'], kind: 'select', options: ['system_default', 'professional', 'personal', 'developer', 'coach', 'mentor', 'secretary', 'companion'] },
      { label: 'Verbosity', path: ['behavior', 'verbosity'], kind: 'select', options: ['minimal', 'concise', 'normal', 'detailed', 'exhaustive'] },
      { label: 'Prefer Citations', path: ['behavior', 'preferSourceCitations'], kind: 'boolean' },
    ],
  },
  appearance: {
    label: 'Appearance',
    description: 'Theme, density, and interface presentation.',
    fields: [
      { label: 'Theme', path: ['theme', 'theme'], kind: 'select', options: ['system', 'light', 'dark', 'dim', 'oled'] },
      { label: 'Accent Color', path: ['theme', 'accentColor'], kind: 'select', options: ['default', 'cyan', 'blue', 'violet', 'pink', 'brand'] },
      { label: 'Density', path: ['layout', 'density'], kind: 'select', options: ['compact', 'comfortable', 'spacious'] },
      { label: 'Show Relative Time', path: ['dataDisplay', 'showRelativeTime'], kind: 'boolean' },
    ],
  },
  communication: {
    label: 'Communication',
    description: 'Tone, cadence, and message style.',
    fields: [
      { label: 'Tone', path: ['tone', 'tone'], kind: 'select', options: ['system_default', 'professional', 'friendly', 'casual', 'direct', 'warm', 'technical'] },
      { label: 'Verbosity', path: ['tone', 'verbosity'], kind: 'select', options: ['minimal', 'concise', 'normal', 'detailed', 'exhaustive'] },
      { label: 'Progress Updates', path: ['progress', 'updateFrequency'], kind: 'select', options: ['never', 'only_long_tasks', 'periodic', 'frequent', 'step_by_step'] },
      { label: 'Use Markdown', path: ['messages', 'useMarkdown'], kind: 'boolean' },
    ],
  },
  content: {
    label: 'Content',
    description: 'Filtering, maturity, and media behavior.',
    fields: [
      { label: 'Filter Strictness', path: ['filtering', 'strictness'], kind: 'select', options: ['off', 'low', 'standard', 'strict', 'maximum'] },
      { label: 'Safe Search', path: ['filtering', 'safeSearch'], kind: 'select', options: ['off', 'moderate', 'strict', 'locked'] },
      { label: 'Autoplay', path: ['media', 'autoplay'], kind: 'select', options: ['allow', 'wifi_only', 'muted_only', 'disabled'] },
      { label: 'Hide Spoilers', path: ['spoilers', 'hideSpoilers'], kind: 'boolean' },
    ],
  },
  developer: {
    label: 'Developer',
    description: 'Code, editor, and testing preferences.',
    fields: [
      { label: 'Preferred Package Manager', path: ['stack', 'preferredPackageManager'], kind: 'select', options: ['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'pip', 'uv', 'poetry'] },
      { label: 'Indent Style', path: ['formatting', 'indentStyle'], kind: 'select', options: ['tabs', 'spaces', 'project_default'] },
      { label: 'TypeScript Strict', path: ['typescript', 'strict'], kind: 'boolean' },
      { label: 'Write Tests By Default', path: ['testing', 'writeTestsByDefault'], kind: 'boolean' },
    ],
  },
  integrations: {
    label: 'Integrations',
    description: 'Connection and permission defaults.',
    fields: [
      { label: 'Mode', path: ['mode'], kind: 'select', options: preferenceModes },
      { label: 'Allow New Connections', path: ['global', 'allowNewConnections'], kind: 'boolean' },
      { label: 'Allow OAuth Connections', path: ['global', 'allowOAuthConnections'], kind: 'boolean' },
      { label: 'Prefer Least Privilege', path: ['global', 'preferLeastPrivilegeScopes'], kind: 'boolean' },
    ],
  },
  localization: {
    label: 'Localization',
    description: 'Locale, timezone, and formatting defaults.',
    fields: [
      { label: 'Locale', path: ['locale', 'locale'], kind: 'text' },
      { label: 'Timezone', path: ['timezone', 'timezone'], kind: 'text' },
      { label: 'Show Week Numbers', path: ['dateTime', 'showWeekNumbers'], kind: 'boolean' },
      { label: 'Localized Names', path: ['formatting', 'localizedNames'], kind: 'boolean' },
    ],
  },
  memory: {
    label: 'Memory',
    description: 'Saving, recall, and retention behavior.',
    fields: [
      { label: 'Mode', path: ['mode'], kind: 'select', options: preferenceModes },
      { label: 'Preference Memories', path: ['save', 'allowPreferenceMemories'], kind: 'boolean' },
      { label: 'Cross-Conversation Recall', path: ['recall', 'allowCrossConversationRecall'], kind: 'boolean' },
      { label: 'Retention Days', path: ['retention', 'defaultRetentionDays'], kind: 'number' },
    ],
  },
  notifications: {
    label: 'Notifications',
    description: 'Delivery and interruption defaults.',
    fields: [
      { label: 'Mode', path: ['mode'], kind: 'select', options: preferenceModes },
      { label: 'Show Previews', path: ['showPreviews'], kind: 'boolean' },
      { label: 'Allow Critical Alerts', path: ['allowCriticalAlerts'], kind: 'boolean' },
      { label: 'Allow Marketing', path: ['allowMarketing'], kind: 'boolean' },
    ],
  },
  privacy: {
    label: 'Privacy',
    description: 'Discovery, data, and sharing preferences.',
    fields: [
      { label: 'Show Online Status', path: ['profile', 'showOnlineStatus'], kind: 'boolean' },
      { label: 'Allow Direct Messages', path: ['communication', 'allowDirectMessages'], kind: 'boolean' },
      { label: 'Allow Product Analytics', path: ['analytics', 'allowProductAnalytics'], kind: 'boolean' },
      { label: 'Allow AI Training', path: ['ai', 'allowAiTraining'], kind: 'boolean' },
    ],
  },
  security: {
    label: 'Security',
    description: 'Authentication and session protections.',
    fields: [
      { label: 'Assurance Level', path: ['assuranceLevel'], kind: 'select', options: ['aal1', 'aal2', 'aal3'] },
      { label: 'MFA Policy', path: ['mfa', 'policy'], kind: 'select', options: ['disabled', 'optional', 'recommended', 'required', 'required_for_sensitive_actions'] },
      { label: 'Passkey Policy', path: ['passkeys', 'policy'], kind: 'select', options: ['disabled', 'optional', 'preferred', 'required'] },
      { label: 'Login Alerts', path: ['loginAlerts', 'level'], kind: 'select', options: ['disabled', 'suspicious_only', 'new_device', 'new_location', 'all_logins'] },
    ],
  },
};

function formatReadableDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function formatOptionLabel(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getPathValue(source: unknown, path: SettingsPath): unknown {
  return path.reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    return (value as Record<string, unknown>)[key];
  }, source);
}

function setPathValue<TValue extends object>(
  source: TValue,
  path: SettingsPath,
  value: unknown,
): TValue {
  const next = structuredClone(source) as Record<string, unknown>;
  let cursor = next;

  path.forEach((key, index) => {
    if (index === path.length - 1) {
      cursor[key] = value;
      return;
    }

    const current = cursor[key];

    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[key] = {};
    }

    cursor = cursor[key] as Record<string, unknown>;
  });

  return next as TValue;
}

function sectionConfiguredFieldCount(
  section: SettingsSectionKey,
  value: SettingsSectionValueMap[SettingsSectionKey],
): number {
  return sectionDefinitions[section].fields.filter(
    (field) => getPathValue(value, field.path) !== undefined,
  ).length;
}

function createDraft(settings: SettingsCardSettings): SettingsDraft {
  return Object.fromEntries(
    settingsSectionKeys.map((key) => [key, structuredClone(settings[key])]),
  ) as SettingsDraft;
}

export function SettingsCard({
  settings,
  editing = false,
  onEdit,
  onCancel,
  onSave,
  ...cardProps
}: SettingsCardProps): React.ReactElement {
  const [draft, setDraft] = React.useState<SettingsDraft>(() =>
    createDraft(settings),
  );
  const [errors, setErrors] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setDraft(createDraft(settings));
    setErrors([]);
  }, [settings]);

  const updateField = React.useCallback(
    (section: SettingsSectionKey, path: SettingsPath, value: unknown): void => {
      setDraft((current) => ({
        ...current,
        [section]: setPathValue(current[section], path, value),
      }));
    },
    [],
  );

  const handleSave = async (): Promise<void> => {
    if (!onSave) {
      return;
    }

    setSaving(true);
    setErrors([]);

    try {
      await onSave(draft);
    } catch {
      setErrors(['Unable to save settings changes.']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      {...cardProps}
      sx={{
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(10, 14, 28, 0.84)',
        ...cardProps.sx,
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Settings
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(235,242,255,0.72)' }}>
              Updated {formatReadableDate(settings.updatedAt)}
            </Typography>
          </Box>

          <Divider />

          {errors.length > 0 ? <Alert severity="error">{errors.join(' ')}</Alert> : null}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            {settingsSectionKeys.map((key) => {
              const definition = sectionDefinitions[key];

              return (
                <Box
                  key={key}
                  sx={{
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 1,
                    p: 1.75,
                  }}
                >
                  <Stack spacing={1.5}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>
                        {definition.label}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'rgba(235,242,255,0.66)' }}>
                        {editing
                          ? definition.description
                          : `${sectionConfiguredFieldCount(key, settings[key])} configured field${sectionConfiguredFieldCount(key, settings[key]) === 1 ? '' : 's'}`}
                      </Typography>
                    </Box>

                    {editing ? (
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                          gap: 1.25,
                        }}
                      >
                        {definition.fields.map((field) => {
                          const value = getPathValue(draft[key], field.path);

                          if (field.kind === 'boolean') {
                            return (
                              <FormControlLabel
                                key={field.label}
                                control={
                                  <Switch
                                    checked={Boolean(value)}
                                    onChange={(event) =>
                                      updateField(key, field.path, event.target.checked)
                                    }
                                  />
                                }
                                label={field.label}
                              />
                            );
                          }

                          return (
                            <TextField
                              key={field.label}
                              fullWidth
                              label={field.label}
                              select={field.kind === 'select'}
                              type={field.kind === 'number' ? 'number' : undefined}
                              value={value ?? ''}
                              onChange={(event) =>
                                updateField(
                                  key,
                                  field.path,
                                  field.kind === 'number'
                                    ? event.target.value === ''
                                      ? undefined
                                      : Number(event.target.value)
                                    : event.target.value || undefined,
                                )
                              }
                            >
                              {field.kind === 'select'
                                ? [
                                    <MenuItem key="unset" value="">
                                      Not Set
                                    </MenuItem>,
                                    ...(field.options ?? []).map((option) => (
                                      <MenuItem key={option} value={option}>
                                        {formatOptionLabel(option)}
                                      </MenuItem>
                                    )),
                                  ]
                                : null}
                            </TextField>
                          );
                        })}
                      </Box>
                    ) : null}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </Stack>
      </CardContent>

      <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
        {editing ? (
          <>
            <Button onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              Save
            </Button>
          </>
        ) : (
          <Button onClick={onEdit}>Edit Settings</Button>
        )}
      </CardActions>
    </Card>
  );
}

export default SettingsCard;

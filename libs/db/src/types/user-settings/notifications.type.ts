// libs/db/src/types/user-settings/notifications.type.ts

export type NotificationPreferenceMode = 'system' | 'enabled' | 'disabled';

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

export type NotificationDeliveryChannel =
  | 'in_app'
  | 'push'
  | 'email'
  | 'sms'
  | 'webhook'
  | 'discord'
  | 'slack';

export type NotificationPriority =
  | 'low'
  | 'normal'
  | 'high'
  | 'urgent'
  | 'critical';

export type NotificationFrequency =
  | 'realtime'
  | 'batched'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'never';

export type NotificationDigestFrequency =
  | 'disabled'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly';

export type NotificationSoundPreference =
  | 'system'
  | 'silent'
  | 'subtle'
  | 'normal'
  | 'loud'
  | 'custom';

export type NotificationVibrationPreference =
  | 'system'
  | 'disabled'
  | 'short'
  | 'normal'
  | 'long'
  | 'custom';

export type NotificationQuietHoursBehavior =
  | 'silence_all'
  | 'allow_urgent'
  | 'allow_critical'
  | 'digest_only';

export type NotificationCategory =
  | 'account'
  | 'security'
  | 'billing'
  | 'system'
  | 'product'
  | 'marketing'
  | 'social'
  | 'messages'
  | 'mentions'
  | 'comments'
  | 'reminders'
  | 'automations'
  | 'integrations'
  | 'projects'
  | 'tasks'
  | 'calendar'
  | 'files'
  | 'analytics'
  | 'reports'
  | 'deployments'
  | 'incidents'
  | 'alerts'
  | 'compliance'
  | 'newsletter';

export type NotificationChannelSettings = {
  enabled?: boolean;
  permission?: NotificationPermissionState;
  frequency?: NotificationFrequency;
  minimumPriority?: NotificationPriority;
};

export type NotificationCategorySettings = {
  enabled?: boolean;
  channels?: Partial<Record<NotificationDeliveryChannel, boolean>>;
  frequency?: NotificationFrequency;
  minimumPriority?: NotificationPriority;
  includeInDigest?: boolean;
};

export type NotificationQuietHoursSettings = {
  enabled?: boolean;
  timezone?: string;
  startTime?: string;
  endTime?: string;
  days?: Array<
    | 'sunday'
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
  >;
  behavior?: NotificationQuietHoursBehavior;
};

export type NotificationDigestSettings = {
  enabled?: boolean;
  frequency?: NotificationDigestFrequency;
  timezone?: string;
  deliveryTime?: string;
  channels?: NotificationDeliveryChannel[];
  includeCategories?: NotificationCategory[];
  excludeCategories?: NotificationCategory[];
};

export type NotificationDeviceSettings = {
  deviceId?: string;
  deviceName?: string;
  enabled?: boolean;
  channels?: Partial<Record<NotificationDeliveryChannel, boolean>>;
  pushEndpointId?: string;
  lastSeenAt?: string;
};

export type NotificationUserSettings = {
  mode?: NotificationPreferenceMode;
  defaultChannels?: Partial<
    Record<NotificationDeliveryChannel, NotificationChannelSettings>
  >;
  categories?: Partial<Record<NotificationCategory, NotificationCategorySettings>>;
  quietHours?: NotificationQuietHoursSettings;
  digest?: NotificationDigestSettings;
  devices?: NotificationDeviceSettings[];
  sound?: NotificationSoundPreference;
  vibration?: NotificationVibrationPreference;
  showPreviews?: boolean;
  requireInteraction?: boolean;
  allowCriticalAlerts?: boolean;
  allowMarketing?: boolean;
};

export type NotificationUserSettingsPatch = {
  mode?: NotificationPreferenceMode;
  defaultChannels?: Partial<
    Record<NotificationDeliveryChannel, Partial<NotificationChannelSettings>>
  >;
  categories?: Partial<
    Record<NotificationCategory, Partial<NotificationCategorySettings>>
  >;
  quietHours?: Partial<NotificationQuietHoursSettings>;
  digest?: Partial<NotificationDigestSettings>;
  devices?: Array<Partial<NotificationDeviceSettings>>;
  sound?: NotificationSoundPreference;
  vibration?: NotificationVibrationPreference;
  showPreviews?: boolean;
  requireInteraction?: boolean;
  allowCriticalAlerts?: boolean;
  allowMarketing?: boolean;
};
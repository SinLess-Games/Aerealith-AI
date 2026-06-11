// libs/flags/src/constants.ts

import type {
  FlagDefaultValues,
  FlagEnvironment,
  FlagKey,
  FlagValueKind,
} from './types';

export const FLAGS_PACKAGE_NAME = '@aerealith-ai/flags' as const;

export const FLAGS_PROVIDER_NAME = 'aerealith-flagship' as const;

export const FLAGS_CLIENT_NAME = 'aerealith-ai' as const;

export const FLAGS_DEFAULT_ENVIRONMENT =
  'development' satisfies FlagEnvironment;

export const FLAGS_SUPPORTED_VALUE_KINDS = [
  'boolean',
  'string',
  'number',
  'object',
] as const satisfies readonly FlagValueKind[];

export const FLAGS_DEFAULT_VALUES: FlagDefaultValues = {
  boolean: false,
  string: '',
  number: 0,
  object: {},
};

export const FLAGS_CONTEXT_KEYS = {
  targetingKey: 'targetingKey',
  userId: 'userId',
  anonymousId: 'anonymousId',
  sessionId: 'sessionId',
  organizationId: 'organizationId',
  workspaceId: 'workspaceId',
  accountId: 'accountId',
  email: 'email',
  username: 'username',
  role: 'role',
  plan: 'plan',
  country: 'country',
  locale: 'locale',
  environment: 'environment',
  authenticated: 'authenticated',
  internal: 'internal',
  admin: 'admin',
} as const;

export const FLAGS_HEADER_KEYS = {
  targetingKey: 'x-aerealith-flag-targeting-key',
  userId: 'x-aerealith-user-id',
  anonymousId: 'x-aerealith-anonymous-id',
  sessionId: 'x-aerealith-session-id',
  organizationId: 'x-aerealith-organization-id',
  workspaceId: 'x-aerealith-workspace-id',
  plan: 'x-aerealith-plan',
  country: 'x-aerealith-country',
  locale: 'x-aerealith-locale',
  environment: 'x-aerealith-environment',
} as const;

export const FLAGS_COOKIE_KEYS = {
  targetingKey: 'aerealith_flag_targeting_key',
  anonymousId: 'aerealith_anonymous_id',
  sessionId: 'aerealith_session_id',
} as const;

export const FLAGS_ENV_KEYS = {
  appId: 'CLOUDFLARE_FLAGSHIP_APP_ID',
  accountId: 'CLOUDFLARE_ACCOUNT_ID',
  authToken: 'CLOUDFLARE_FLAGSHIP_AUTH_TOKEN',
  environment: 'AEREALITH_ENVIRONMENT',
  providerName: 'AEREALITH_FLAGS_PROVIDER_NAME',
} as const;

export const FLAGS_FLAGSHIP_APP_ID =
  '2a1ca9ba-b446-4cb8-b8eb-ab0f3985679f' as const;

export const FLAGS_WORKER_BINDING_KEYS = {
  flagship: 'FLAGS',
} as const;

export const FLAGS_ERROR_CODES = {
  missingProvider: 'FLAGS_MISSING_PROVIDER',
  missingClient: 'FLAGS_MISSING_CLIENT',
  missingCredentials: 'FLAGS_MISSING_CREDENTIALS',
  missingBinding: 'FLAGS_MISSING_BINDING',
  missingTargetingKey: 'FLAGS_MISSING_TARGETING_KEY',
  invalidFlagKey: 'FLAGS_INVALID_FLAG_KEY',
  invalidContext: 'FLAGS_INVALID_CONTEXT',
  invalidDefaultValue: 'FLAGS_INVALID_DEFAULT_VALUE',
  unsupportedValueKind: 'FLAGS_UNSUPPORTED_VALUE_KIND',
  evaluationFailed: 'FLAGS_EVALUATION_FAILED',
  providerInitializationFailed: 'FLAGS_PROVIDER_INITIALIZATION_FAILED',
  clientInitializationFailed: 'FLAGS_CLIENT_INITIALIZATION_FAILED',
  flagNotFound: 'FLAGS_FLAG_NOT_FOUND',
} as const;

export const FLAGS_LOG_MESSAGES = {
  providerInitialized: 'Feature flag provider initialized.',
  providerInitializationFailed: 'Feature flag provider initialization failed.',
  evaluationStarted: 'Feature flag evaluation started.',
  evaluationCompleted: 'Feature flag evaluation completed.',
  evaluationFailed: 'Feature flag evaluation failed.',
  contextBuilt: 'Feature flag evaluation context built.',
  contextMissingTargetingKey: 'Feature flag context is missing targetingKey.',
} as const;

export const FLAGS_TELEMETRY_EVENT_NAMES = {
  providerInitialized: 'flags.provider.initialized',
  providerInitializationFailed: 'flags.provider.initialization_failed',
  evaluationStarted: 'flags.evaluation.started',
  evaluationCompleted: 'flags.evaluation.completed',
  evaluationFailed: 'flags.evaluation.failed',
  contextBuilt: 'flags.context.built',
} as const;

export const FLAGS_PREFETCH_DEFAULTS = {
  flags: [] as readonly FlagKey[],
} as const;

export const FLAGS_SECURITY_LIMITS = {
  maxFlagKeyLength: 128,
  maxContextAttributeKeyLength: 128,
  maxContextStringValueLength: 512,
  maxPrefetchFlags: 100,
} as const;

export const FLAGS_FLAG_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

export const FLAGS_CONTEXT_ATTRIBUTE_KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export const FLAGS_ANONYMOUS_TARGETING_PREFIX = 'anonymous' as const;

export const FLAGS_USER_TARGETING_PREFIX = 'user' as const;

export const FLAGS_ORGANIZATION_TARGETING_PREFIX = 'org' as const;

export const FLAGS_WORKSPACE_TARGETING_PREFIX = 'workspace' as const;

export const FLAGS_TARGETING_SEPARATOR = ':' as const;

export const FLAGS_KNOWN_RUNTIME_NAMES = {
  server: 'server',
  client: 'client',
  worker: 'worker',
  node: 'node',
  browser: 'browser',
  hono: 'hono',
  testing: 'testing',
} as const;

export const FLAGS_OPENFEATURE_DOMAINS = {
  default: 'default',
  server: 'server',
  client: 'client',
  hono: 'hono',
  testing: 'testing',
} as const;

export const FLAGS_REASON_NAMES = {
  default: 'DEFAULT',
  targeted: 'TARGETING_MATCH',
  split: 'SPLIT',
  cached: 'CACHED',
  static: 'STATIC',
  error: 'ERROR',
  disabled: 'DISABLED',
  unknown: 'UNKNOWN',
} as const;

export const FLAGS_BOOLEAN_VARIATIONS = {
  on: true,
  off: false,
} as const;

export const FLAGS_COMMON_KEYS = {
  authentication: 'authentication',
  registration: 'registration',
  billing: 'billing',
  pricing: 'pricing',
  dashboard: 'dashboard',
  onboarding: 'onboarding',
  observability: 'observability',
  profile: 'profile',
  profilePublic: 'profile-public',
  profilePrivate: 'profile-private',
  profileAppConnections: 'profile-app-connections',
  profileIntegrations: 'profile-integrations',
  profileFiles: 'profile-files',
  profileReports: 'profile-reports',
  profileAchievements: 'profile-achievements',
  maintenanceMode: 'maintenance-mode',
} as const satisfies Record<string, FlagKey>;

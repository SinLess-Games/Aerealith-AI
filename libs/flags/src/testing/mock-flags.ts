import {
  FLAGS_COMMON_KEYS,
  FLAGS_DEFAULT_VALUES,
} from '../constants';

import type {
  AnyFlagDefinition,
  BooleanFlagDefinition,
  FlagDefaultValues,
  FlagJsonValue,
  FlagKey,
  FlagRegistry,
  MockFlagProviderOptions,
  MockFlagValues,
  NumberFlagDefinition,
  ObjectFlagDefinition,
  StringFlagDefinition,
} from '../types';

export const MOCK_BOOLEAN_FLAGS = {
  authentication: {
    key: FLAGS_COMMON_KEYS.authentication,
    kind: 'boolean',
    defaultValue: true,
    description: 'Enables or disables authentication flows.',
    owner: 'platform',
    tags: ['core', 'auth'],
  },

  registration: {
    key: FLAGS_COMMON_KEYS.registration,
    kind: 'boolean',
    defaultValue: false,
    description: 'Enables or disables new account registration.',
    owner: 'platform',
    tags: ['core', 'auth'],
  },

  billing: {
    key: FLAGS_COMMON_KEYS.billing,
    kind: 'boolean',
    defaultValue: false,
    description: 'Enables or disables billing features.',
    owner: 'platform',
    tags: ['billing'],
  },

  pricing: {
    key: FLAGS_COMMON_KEYS.pricing,
    kind: 'boolean',
    defaultValue: true,
    description: 'Enables or disables pricing page and pricing UI.',
    owner: 'frontend',
    tags: ['marketing', 'pricing'],
  },

  dashboard: {
    key: FLAGS_COMMON_KEYS.dashboard,
    kind: 'boolean',
    defaultValue: true,
    description: 'Enables or disables dashboard access.',
    owner: 'frontend',
    tags: ['app', 'dashboard'],
  },

  onboarding: {
    key: FLAGS_COMMON_KEYS.onboarding,
    kind: 'boolean',
    defaultValue: true,
    description: 'Enables or disables onboarding flows.',
    owner: 'product',
    tags: ['app', 'onboarding'],
  },

  observability: {
    key: FLAGS_COMMON_KEYS.observability,
    kind: 'boolean',
    defaultValue: false,
    description: 'Enables or disables observability-facing features.',
    owner: 'platform',
    tags: ['platform', 'observability'],
  },

  maintenanceMode: {
    key: FLAGS_COMMON_KEYS.maintenanceMode,
    kind: 'boolean',
    defaultValue: false,
    description: 'Enables or disables maintenance mode.',
    owner: 'platform',
    tags: ['platform', 'operations'],
  },
} as const satisfies Record<string, BooleanFlagDefinition>;

export const MOCK_STRING_FLAGS = {
  dashboardVariant: {
    key: 'dashboard-variant',
    kind: 'string',
    defaultValue: 'default',
    description: 'Controls the dashboard UI variant.',
    owner: 'frontend',
    tags: ['app', 'dashboard', 'experiment'],
  },

  onboardingVariant: {
    key: 'onboarding-variant',
    kind: 'string',
    defaultValue: 'default',
    description: 'Controls the onboarding experience variant.',
    owner: 'product',
    tags: ['app', 'onboarding', 'experiment'],
  },
} as const satisfies Record<string, StringFlagDefinition>;

export const MOCK_NUMBER_FLAGS = {
  maxProjects: {
    key: 'max-projects',
    kind: 'number',
    defaultValue: 3,
    description: 'Controls the default maximum number of projects.',
    owner: 'product',
    tags: ['limits'],
  },

  maxUploads: {
    key: 'max-uploads',
    kind: 'number',
    defaultValue: 10,
    description: 'Controls the default maximum number of uploads.',
    owner: 'product',
    tags: ['limits', 'uploads'],
  },
} as const satisfies Record<string, NumberFlagDefinition>;

export type MockPricingConfig = {
  readonly enabled: boolean;
  readonly showAnnualToggle: boolean;
  readonly defaultPlan: string;
  readonly highlightedPlan: string;
};

export type MockOnboardingConfig = {
  readonly enabled: boolean;
  readonly requiredSteps: readonly string[];
  readonly skippable: boolean;
};

export type MockObservabilityConfig = {
  readonly enabled: boolean;
  readonly showMetrics: boolean;
  readonly showLogs: boolean;
  readonly showTraces: boolean;
};

export const MOCK_OBJECT_FLAGS = {
  pricingConfig: {
    key: 'pricing-config',
    kind: 'object',
    defaultValue: {
      enabled: true,
      showAnnualToggle: true,
      defaultPlan: 'free',
      highlightedPlan: 'pro',
    } satisfies MockPricingConfig,
    description: 'Controls structured pricing UI configuration.',
    owner: 'frontend',
    tags: ['pricing', 'config'],
  },

  onboardingConfig: {
    key: 'onboarding-config',
    kind: 'object',
    defaultValue: {
      enabled: true,
      requiredSteps: ['profile', 'workspace', 'preferences'],
      skippable: true,
    } satisfies MockOnboardingConfig,
    description: 'Controls structured onboarding configuration.',
    owner: 'product',
    tags: ['onboarding', 'config'],
  },

  observabilityConfig: {
    key: 'observability-config',
    kind: 'object',
    defaultValue: {
      enabled: false,
      showMetrics: true,
      showLogs: true,
      showTraces: false,
    } satisfies MockObservabilityConfig,
    description: 'Controls structured observability UI configuration.',
    owner: 'platform',
    tags: ['observability', 'config'],
  },
} as const satisfies Record<string, ObjectFlagDefinition<FlagJsonValue>>;

export const MOCK_FLAG_REGISTRY = {
  ...MOCK_BOOLEAN_FLAGS,
  ...MOCK_STRING_FLAGS,
  ...MOCK_NUMBER_FLAGS,
  ...MOCK_OBJECT_FLAGS,
} as const satisfies FlagRegistry;

export const MOCK_DEFAULT_FLAG_VALUES = {
  boolean: FLAGS_DEFAULT_VALUES.boolean,
  string: FLAGS_DEFAULT_VALUES.string,
  number: FLAGS_DEFAULT_VALUES.number,
  object: FLAGS_DEFAULT_VALUES.object,
} as const satisfies FlagDefaultValues;

export const MOCK_FLAG_VALUES = {
  [FLAGS_COMMON_KEYS.authentication]: true,
  [FLAGS_COMMON_KEYS.registration]: false,
  [FLAGS_COMMON_KEYS.billing]: false,
  [FLAGS_COMMON_KEYS.pricing]: true,
  [FLAGS_COMMON_KEYS.dashboard]: true,
  [FLAGS_COMMON_KEYS.onboarding]: true,
  [FLAGS_COMMON_KEYS.observability]: false,
  [FLAGS_COMMON_KEYS.maintenanceMode]: false,

  'dashboard-variant': 'default',
  'onboarding-variant': 'default',

  'max-projects': 3,
  'max-uploads': 10,

  'pricing-config': MOCK_OBJECT_FLAGS.pricingConfig.defaultValue,
  'onboarding-config': MOCK_OBJECT_FLAGS.onboardingConfig.defaultValue,
  'observability-config': MOCK_OBJECT_FLAGS.observabilityConfig.defaultValue,
} as const satisfies MockFlagValues;

export const MOCK_ALL_FLAGS_ENABLED_VALUES = {
  ...MOCK_FLAG_VALUES,
  [FLAGS_COMMON_KEYS.authentication]: true,
  [FLAGS_COMMON_KEYS.registration]: true,
  [FLAGS_COMMON_KEYS.billing]: true,
  [FLAGS_COMMON_KEYS.pricing]: true,
  [FLAGS_COMMON_KEYS.dashboard]: true,
  [FLAGS_COMMON_KEYS.onboarding]: true,
  [FLAGS_COMMON_KEYS.observability]: true,
  [FLAGS_COMMON_KEYS.maintenanceMode]: false,
} as const satisfies MockFlagValues;

export const MOCK_ALL_FLAGS_DISABLED_VALUES = {
  ...MOCK_FLAG_VALUES,
  [FLAGS_COMMON_KEYS.authentication]: false,
  [FLAGS_COMMON_KEYS.registration]: false,
  [FLAGS_COMMON_KEYS.billing]: false,
  [FLAGS_COMMON_KEYS.pricing]: false,
  [FLAGS_COMMON_KEYS.dashboard]: false,
  [FLAGS_COMMON_KEYS.onboarding]: false,
  [FLAGS_COMMON_KEYS.observability]: false,
  [FLAGS_COMMON_KEYS.maintenanceMode]: false,
} as const satisfies MockFlagValues;

export const MOCK_MAINTENANCE_MODE_VALUES = {
  ...MOCK_FLAG_VALUES,
  [FLAGS_COMMON_KEYS.maintenanceMode]: true,
  [FLAGS_COMMON_KEYS.registration]: false,
  [FLAGS_COMMON_KEYS.billing]: false,
  [FLAGS_COMMON_KEYS.dashboard]: false,
} as const satisfies MockFlagValues;

export const MOCK_BETA_USER_VALUES = {
  ...MOCK_FLAG_VALUES,
  [FLAGS_COMMON_KEYS.registration]: true,
  [FLAGS_COMMON_KEYS.billing]: true,
  [FLAGS_COMMON_KEYS.observability]: true,
  'dashboard-variant': 'beta',
  'onboarding-variant': 'guided',
  'max-projects': 10,
  'max-uploads': 100,
} as const satisfies MockFlagValues;

export const MOCK_ENTERPRISE_USER_VALUES = {
  ...MOCK_FLAG_VALUES,
  [FLAGS_COMMON_KEYS.registration]: true,
  [FLAGS_COMMON_KEYS.billing]: true,
  [FLAGS_COMMON_KEYS.observability]: true,
  'dashboard-variant': 'enterprise',
  'onboarding-variant': 'enterprise',
  'max-projects': 100,
  'max-uploads': 1000,
  'pricing-config': {
    enabled: true,
    showAnnualToggle: true,
    defaultPlan: 'enterprise',
    highlightedPlan: 'enterprise',
  } satisfies MockPricingConfig,
  'observability-config': {
    enabled: true,
    showMetrics: true,
    showLogs: true,
    showTraces: true,
  } satisfies MockObservabilityConfig,
} as const satisfies MockFlagValues;

export const MOCK_FLAG_KEYS = Object.values(MOCK_FLAG_REGISTRY).map(
  (definition) => definition.key,
);

export const MOCK_BOOLEAN_FLAG_KEYS = Object.values(MOCK_BOOLEAN_FLAGS).map(
  (definition) => definition.key,
);

export const MOCK_STRING_FLAG_KEYS = Object.values(MOCK_STRING_FLAGS).map(
  (definition) => definition.key,
);

export const MOCK_NUMBER_FLAG_KEYS = Object.values(MOCK_NUMBER_FLAGS).map(
  (definition) => definition.key,
);

export const MOCK_OBJECT_FLAG_KEYS = Object.values(MOCK_OBJECT_FLAGS).map(
  (definition) => definition.key,
);

export function createMockFlagValues(
  overrides: MockFlagValues = {},
): MockFlagValues {
  return {
    ...MOCK_FLAG_VALUES,
    ...overrides,
  };
}

export function createMockFlagRegistry(
  overrides: FlagRegistry = {},
): FlagRegistry {
  return {
    ...MOCK_FLAG_REGISTRY,
    ...overrides,
  };
}

export function createMockFlagProviderOptions(
  options: MockFlagProviderOptions = {},
): MockFlagProviderOptions {
  return {
    defaultValues: {
      ...MOCK_DEFAULT_FLAG_VALUES,
      ...options.defaultValues,
    },
    values: createMockFlagValues(options.values),
    context: options.context,
  };
}

export function getMockFlagDefinition(
  key: FlagKey,
  registry: FlagRegistry = MOCK_FLAG_REGISTRY,
): AnyFlagDefinition | undefined {
  return Object.values(registry).find((definition) => definition.key === key);
}

export function getRequiredMockFlagDefinition(
  key: FlagKey,
  registry: FlagRegistry = MOCK_FLAG_REGISTRY,
): AnyFlagDefinition {
  const definition = getMockFlagDefinition(key, registry);

  if (!definition) {
    throw new Error(`Mock feature flag definition not found: ${key}`);
  }

  return definition;
}

export function getMockFlagDefaultValue(
  key: FlagKey,
  registry: FlagRegistry = MOCK_FLAG_REGISTRY,
): AnyFlagDefinition['defaultValue'] {
  return getRequiredMockFlagDefinition(key, registry).defaultValue;
}

export function getMockFlagValue(
  key: FlagKey,
  values: MockFlagValues = MOCK_FLAG_VALUES,
  registry: FlagRegistry = MOCK_FLAG_REGISTRY,
): AnyFlagDefinition['defaultValue'] {
  const value = values[key];

  if (value !== undefined) {
    return value;
  }

  return getMockFlagDefaultValue(key, registry);
}

export function setMockFlagValue(
  values: MockFlagValues,
  key: FlagKey,
  value: MockFlagValues[FlagKey],
): MockFlagValues {
  return {
    ...values,
    [key]: value,
  };
}

export function enableMockFlag(
  values: MockFlagValues,
  key: FlagKey,
): MockFlagValues {
  return setMockFlagValue(values, key, true);
}

export function disableMockFlag(
  values: MockFlagValues,
  key: FlagKey,
): MockFlagValues {
  return setMockFlagValue(values, key, false);
}

export function pickMockFlags(
  values: MockFlagValues,
  keys: readonly FlagKey[],
): MockFlagValues {
  return Object.fromEntries(
    keys
      .filter((key) => key in values)
      .map((key) => [key, values[key]]),
  ) satisfies MockFlagValues;
}

export function omitMockFlags(
  values: MockFlagValues,
  keys: readonly FlagKey[],
): MockFlagValues {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !keys.includes(key)),
  ) satisfies MockFlagValues;
}

export function isMockFlagEnabled(
  key: FlagKey,
  values: MockFlagValues = MOCK_FLAG_VALUES,
): boolean {
  return getMockFlagValue(key, values) === true;
}